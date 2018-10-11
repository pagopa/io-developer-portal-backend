/**
 * Methods used to
 * - add users to Azure API management Products and Groups
 * - manage subscriptions and subscriptions keys
 *
 * See https://docs.microsoft.com/en-us/rest/api/apimanagement/
 */
import { ApiManagementClient } from "azure-arm-apimanagement";
import {
  SubscriptionCollection,
  SubscriptionContract,
  UserContract,
  UserCreateParameters
} from "azure-arm-apimanagement/lib/models";
import { Set } from "json-set-map";
import * as msRestAzure from "ms-rest-azure";
import { logger } from "./logger";

import * as memoizee from "memoizee";

import * as config from "./config";

import { Either, left, right } from "fp-ts/lib/Either";
import { isNone, isSome, none, Option, some } from "fp-ts/lib/Option";
import { EmailString } from "italia-ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
import { ulid } from "ulid";

export interface IUserData extends UserCreateParameters {
  readonly oid: string;
  readonly productName: string;
  readonly groups: ReadonlyArray<string>;
}

export interface ITokenAndCredentials {
  readonly token: msRestAzure.TokenResponse;
  readonly loginCreds: msRestAzure.MSIAppServiceTokenCredentials;
  readonly expiresOn: number;
}

export interface IApimConfig {
  readonly azurermResourceGroup: string;
  readonly azurermApim: string;
}

function getToken(
  loginCreds: msRestAzure.MSIAppServiceTokenCredentials
): Promise<msRestAzure.TokenResponse> {
  return new Promise((resolve, reject) => {
    loginCreds.getToken((err, tok) => {
      if (err) {
        logger.debug("getToken() error: %s", err.message);
        return reject(err);
      }
      resolve(tok);
    });
  });
}

export async function loginToApim(
  tokenCreds?: ITokenAndCredentials
): Promise<ITokenAndCredentials> {
  const isTokenExpired = tokenCreds
    ? tokenCreds.expiresOn <= Date.now()
    : false;

  logger.debug(
    "loginToApim() token expires in %d seconds. expired=%s",
    tokenCreds ? Math.round(tokenCreds.expiresOn - Date.now() / 1000) : 0,
    isTokenExpired
  );

  // return old credentials in case the token is not expired
  if (tokenCreds && !isTokenExpired) {
    logger.debug("loginToApim(): get cached token");
    return tokenCreds;
  }

  logger.debug("loginToApim(): login with MSI");

  const loginCreds = await msRestAzure.loginWithAppServiceMSI();
  const token = await getToken(loginCreds);

  return {
    // cache token for 1 hour
    // we cannot use tokenCreds.token.expiresOn
    // because of a bug in ms-rest-library
    // see https://github.com/Azure/azure-sdk-for-node/pull/3679
    expiresOn: Date.now() + 3600 * 1000,
    loginCreds,
    token
  };
}

async function getUserSubscription__(
  apiClient: ApiManagementClient,
  subscriptionId: string,
  userId?: string,
  lconfig: IApimConfig = config
): Promise<Option<SubscriptionContract & { readonly name: string }>> {
  logger.debug("getUserSubscription");
  const subscription = await apiClient.subscription.get(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    subscriptionId
  );
  if ((userId && subscription.userId !== userId) || !subscription.name) {
    return none;
  }
  return some({ name: subscription.name, ...subscription });
}
export const getUserSubscription = memoizee(getUserSubscription__, {
  max: 100,
  maxAge: 3600000,
  normalizer: args => args[1] + ":" + args[2],
  profileName: "getUserSubscription",
  promise: true
});

export async function getUserSubscriptions(
  apiClient: ApiManagementClient,
  userId: string,
  lconfig: IApimConfig = config
): Promise<SubscriptionCollection> {
  logger.debug("getUserSubscriptions");
  // TODO: this list is paginated with a next-link
  // by now we get only the first result page
  return apiClient.userSubscription.list(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    userId
  );
}

async function regenerateKey__(
  apiClient: ApiManagementClient,
  subscriptionId: string,
  userId: string,
  keyType: "primary" | "secondary",
  lconfig: IApimConfig = config
): Promise<Option<SubscriptionContract>> {
  logger.debug("regeneratePrimaryKey");
  const maybeSubscription = await getUserSubscription__(
    apiClient,
    subscriptionId,
    userId
  );
  if (isNone(maybeSubscription)) {
    return none;
  }
  switch (keyType) {
    case "primary":
      await apiClient.subscription.regeneratePrimaryKey(
        lconfig.azurermResourceGroup,
        lconfig.azurermApim,
        subscriptionId
      );
      break;
    case "secondary":
      await apiClient.subscription.regenerateSecondaryKey(
        lconfig.azurermResourceGroup,
        lconfig.azurermApim,
        subscriptionId
      );
      break;
  }
  return getUserSubscription__(apiClient, subscriptionId, userId);
}

export const regeneratePrimaryKey = (
  apiClient: ApiManagementClient,
  subscriptionId: string,
  userId: string
) => {
  // invalidate subscriptions cache
  // tslint:disable-next-line:no-any
  (getUserSubscription as any).delete({}, subscriptionId, userId);
  return regenerateKey__(apiClient, subscriptionId, userId, "primary");
};

export const regenerateSecondaryKey = (
  apiClient: ApiManagementClient,
  subscriptionId: string,
  userId: string
) => {
  // invalidate subscriptions cache
  // tslint:disable-next-line:no-any
  (getUserSubscription as any).delete({}, subscriptionId, userId);
  return regenerateKey__(apiClient, subscriptionId, userId, "secondary");
};

export interface IExtendedUserContract extends UserContract {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly groupNames: SerializableSet<string>;
}

/**
 * Return the corresponding API management user
 * given the Active Directory B2C user's email.
 */
async function getApimUser__(
  apiClient: ApiManagementClient,
  email: string,
  lconfig: IApimConfig = config
): Promise<Option<IExtendedUserContract>> {
  logger.debug("getApimUser");
  const results = await apiClient.user.listByService(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    { filter: "email eq '" + email + "'" }
  );
  logger.debug(
    "lookup apimUsers for (%s) (%s)",
    email,
    JSON.stringify(results)
  );
  if (!results || results.length === 0) {
    return none;
  }
  const user = results[0];
  if (!user.id || !user.name || !user.email || !user.email[0]) {
    return none;
  }
  const groupNames = await getUserGroups(apiClient, user);
  const apimUser = {
    email: user.email,
    id: user.id,
    name: user.name,
    ...user,
    groupNames: isSome(groupNames)
      ? new Set(groupNames.value)
      : (new Set() as SerializableSet<string>)
  };

  // return first matching user
  return some(apimUser);
}

export const getApimUser = memoizee(getApimUser__, {
  max: 100,
  maxAge: 3600000,
  normalizer: args => args[1],
  profileName: "getApimUser",
  promise: true
});

export function isAdminUser(user: IExtendedUserContract): boolean {
  logger.debug("User's groupNames [%s]", Array.from(user.groupNames));
  return user.groupNames.has("ApiAdmin");
}

export async function addUserSubscriptionToProduct(
  apiClient: ApiManagementClient,
  userId: string,
  productName: string,
  lconfig: IApimConfig = config
): Promise<Either<Error, SubscriptionContract>> {
  logger.debug("addUserToProduct");
  const product = await apiClient.product.get(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    productName
  );
  if (!product || !product.id) {
    return left(new Error("Cannot find API management product for update"));
  }
  const subscriptionId = ulid();
  // For some odd reason in the Azure ARM API
  // user.name here is actually the user.id.
  // We do not skip existing subscriptions
  // so we can activate a canceled one.
  return right(
    await apiClient.subscription.createOrUpdate(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim,
      subscriptionId,
      {
        displayName: subscriptionId,
        productId: product.id,
        state: "active",
        userId
      }
    )
  );
}

export async function removeUserFromGroups(
  apiClient: ApiManagementClient,
  user: UserContract,
  groups: ReadonlyArray<string>,
  lconfig: IApimConfig = config
): Promise<Either<Error, ReadonlyArray<string>>> {
  return right(
    await groups.reduce(async (prev, group) => {
      const removedGroups = await prev;
      logger.debug("removeUserFromGroups (%s)", group);
      // For some odd reason in the Azure ARM API user.name
      // here is actually the user.id
      await apiClient.groupUser.deleteMethod(
        lconfig.azurermResourceGroup,
        lconfig.azurermApim,
        group,
        user.name as string
      );
      return [...removedGroups, group];
    }, Promise.resolve([]))
  );
}

/**
 * Returns the array of added groups names (as strings).
 */
export async function addUserToGroups(
  apiClient: ApiManagementClient,
  user: UserContract,
  groups: ReadonlyArray<string>,
  lconfig: IApimConfig = config
): Promise<Either<Error, ReadonlyArray<string>>> {
  logger.debug("addUserToGroups");
  if (!user || !user.name) {
    return left(new Error("Cannot parse user"));
  }
  const existingGroups = await apiClient.userGroup.list(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    user.name
  );
  const existingGroupsNames = new Set(existingGroups.map(g => g.name));
  logger.debug(
    "addUserToGroups|existing groups|%s",
    JSON.stringify(Array.from(existingGroupsNames))
  );
  const missingGroups = new Set(
    groups.filter(g => !existingGroupsNames.has(g))
  );
  if (missingGroups.size === 0) {
    logger.debug(
      "addUserToGroups|user already belongs to groups|%s",
      JSON.stringify(Array.from(existingGroupsNames))
    );
    return right([]);
  }
  // sequence the promises here as calling this method
  // concurrently seems to cause some issues assigning
  // users to groups
  return right(
    await Array.from(missingGroups).reduce(async (prev, group) => {
      logger.debug("addUserToGroups|adding user to group (%s)", group);
      const addedGroups = await prev;
      // If the user already belongs to the unlimited group related
      // to the new group, do not add the user to the limited one
      // (aka: avoids to restrict user rights when adding new subscriptions)
      if (
        existingGroupsNames.has(group.replace(/Limited/, "")) ||
        existingGroupsNames.has(group.replace(/Limited/, "Full"))
      ) {
        logger.debug("addUserToGroups|skipping limited group (%s)", group);
        return addedGroups;
      }
      // For some odd reason in the Azure ARM API user.name
      // here is actually the user.id
      await apiClient.groupUser.create(
        lconfig.azurermResourceGroup,
        lconfig.azurermApim,
        group,
        user.name as string
      );
      return [...addedGroups, group];
    }, Promise.resolve([]))
  );
}

export async function getUserGroups(
  apiClient: ApiManagementClient,
  user: UserContract,
  lconfig: IApimConfig = config
): Promise<Option<ReadonlyArray<string>>> {
  if (!user.name) {
    return none;
  }
  const existingGroups = await apiClient.userGroup.list(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    user.name
  );
  return some(existingGroups.map(g => g.name) as ReadonlyArray<string>);
}

export async function getApimUsers(
  apiClient: ApiManagementClient,
  lconfig: IApimConfig = config
): Promise<ReadonlyArray<UserContract>> {
  // tslint:disable-next-line:readonly-array no-let
  let users: UserContract[] = [];
  logger.debug("getUsers");
  // tslint:disable-next-line:no-let
  let nextUsers = await apiClient.user.listByService(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim
  );
  users = users.concat(nextUsers);
  while (nextUsers.nextLink) {
    logger.debug("getUsers (%s)", nextUsers.nextLink);
    nextUsers = await apiClient.user.listByServiceNext(nextUsers.nextLink);
    users = users.concat(nextUsers);
  }
  return users;
}

export async function createApimUserIfNotExists(
  apiClient: ApiManagementClient,
  userEmail: EmailString,
  userAdId: string,
  firstName: string,
  lastName: string,
  lconfig: IApimConfig = config
): Promise<Option<IExtendedUserContract>> {
  const maybeExistingApimUser = await getApimUser__(
    apiClient,
    userEmail,
    lconfig
  );
  if (isSome(maybeExistingApimUser)) {
    return maybeExistingApimUser;
  }

  logger.debug(
    "createApimUserIfNotExists|Creating new user (%s/%s)",
    userEmail,
    userAdId
  );

  try {
    const newApimUser = await apiClient.user.createOrUpdate(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim,
      userEmail,
      {
        confirmation: "signup",
        email: userEmail,
        firstName,
        identities: [
          {
            id: userAdId,
            provider: "AadB2C"
          }
        ],
        lastName,
        state: "active"
      }
    );

    logger.debug(
      "createApimUserIfNotExists|Created new user (%s)",
      newApimUser
    );

    await addUserToGroups(
      apiClient,
      newApimUser,
      config.apimUserGroups.split(",")
    );

    const maybeRetrievedUser = await getApimUser__(
      apiClient,
      newApimUser.email!,
      lconfig
    );

    return maybeRetrievedUser;
  } catch (e) {
    logger.error("error %s", e);
    return none;
  }
}
