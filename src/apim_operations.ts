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
  UserCreateParameters,
  UserIdentityContract
} from "azure-arm-apimanagement/lib/models";
import { Set } from "json-set-map";
import * as msRestAzure from "ms-rest-azure";
import { logger } from "./logger";

import * as memoizee from "memoizee";

import * as config from "./config";

import { Either, left, right } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import {
  fromNullable,
  isNone,
  isSome,
  none,
  Option,
  some
} from "fp-ts/lib/Option";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
import { ulid } from "ulid";
import { EmailAddress } from "../generated/api/EmailAddress";
import { SelfCareOrganization } from "./auth-strategies/selfcare_identity_strategy";
import {
  MANAGE_APIKEY_PREFIX,
  subscriptionsExceptManageOneApimFilter
} from "./utils/api_key";
import {
  buildApimFilter,
  FilterCompositionEnum,
  FilterFieldEnum,
  FilterSupportedFunctionsEnum
} from "./utils/apim_filters";

export interface IServicePrincipalCreds {
  readonly servicePrincipalClientId: string;
  readonly servicePrincipalSecret: string;
  readonly servicePrincipalTenantId: string;
}

export interface IUserData extends UserCreateParameters {
  readonly oid: string;
  readonly productName: string;
  readonly groups: ReadonlyArray<string>;
}

export interface ITokenAndCredentials {
  readonly token: msRestAzure.TokenResponse;
  readonly loginCreds:
    | msRestAzure.MSIAppServiceTokenCredentials
    | msRestAzure.ApplicationTokenCredentials;
  readonly expiresOn: number;
}

export interface IApimConfig {
  readonly azurermResourceGroup: string;
  readonly azurermApim: string;
}

export interface IApimUserData {
  readonly userEmail: EmailString;
  readonly userIdentity?: UserIdentityContract;
  readonly firstName: string;
  readonly lastName: string;
  readonly note?: string;
}

export const formatApimAccountEmailForSelfcareOrganization = (
  organization: SelfCareOrganization
): EmailAddress =>
  EmailAddress.decode(
    `org.${organization.id}@selfcare.io.pagopa.it`
  ).getOrElseL(() => {
    throw new Error(`Cannot format APIM account email for the organization`);
  });

/**
 * Given a SelfCare organizzation, compose a Apim user data object
 * in the expected shape
 */
export const apimUserForSelfCareOrganization = (
  organization: SelfCareOrganization
): IApimUserData => ({
  firstName: organization.name,
  lastName: organization.id,
  note: organization.fiscal_code,
  userEmail: formatApimAccountEmailForSelfcareOrganization(organization)
});

function getToken(
  loginCreds:
    | msRestAzure.MSIAppServiceTokenCredentials
    | msRestAzure.ApplicationTokenCredentials
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
  tokenCreds?: ITokenAndCredentials,
  servicePrincipalCreds?: IServicePrincipalCreds
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

  const loginCreds = servicePrincipalCreds
    ? await msRestAzure.loginWithServicePrincipalSecret(
        servicePrincipalCreds.servicePrincipalClientId,
        servicePrincipalCreds.servicePrincipalSecret,
        servicePrincipalCreds.servicePrincipalTenantId
      )
    : await msRestAzure.loginWithAppServiceMSI();

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

export async function getUserSubscriptionManage(
  apiClient: ApiManagementClient,
  userId: string,
  userName: string,
  lconfig: IApimConfig = config
): Promise<Option<SubscriptionContract & { readonly name: string }>> {
  const res = tryCatch(
    async () =>
      await apiClient.subscription.get(
        lconfig.azurermResourceGroup,
        lconfig.azurermApim,
        MANAGE_APIKEY_PREFIX + userName
      ),
    _ => {
      return "getUserSubscriptionManage|error";
    }
  )
    .map(subscription => {
      if ((userId && subscription.userId !== userId) || !subscription.name) {
        return none;
      }
      return { name: subscription.name, ...subscription };
    })
    .fold(
      _ => none,
      subscription =>
        some(subscription as SubscriptionContract & { readonly name: string })
    )
    .run();

  return res;
}

export async function getUserSubscriptions(
  apiClient: ApiManagementClient,
  userId: string,
  offset?: number,
  limit?: number,
  subscriptionName?: string,
  lconfig: IApimConfig = config
): Promise<SubscriptionCollection> {
  logger.debug("getUserSubscriptions");

  // this list is paginated with a next-link
  return apiClient.userSubscription.list(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    userId,
    {
      filter:
        subscriptionsExceptManageOneApimFilter() +
        subscriptionByNameApimFilter(subscriptionName),
      skip: offset,
      top: limit
    }
  );
}

/**
 * User Subscription list filtered by name
 *
 * @param name
 * @returns APIM *filter* property
 */
const subscriptionByNameApimFilter = (name?: string) =>
  fromNullable(name).fold("", value =>
    buildApimFilter({
      composeFilter: FilterCompositionEnum.and,
      field: FilterFieldEnum.name,
      filterType: FilterSupportedFunctionsEnum.contains,
      inverse: false,
      value
    }).fold("", result => result)
  );

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
  const groupNames = await getUserGroups(apiClient, user, lconfig);
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
  return user.groupNames.has("apiadmin");
}

export async function addUserSubscriptionToProduct(
  apiClient: ApiManagementClient,
  userId: string,
  productName: string,
  subscriptionId?: string,
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
  if (!subscriptionId) {
    subscriptionId = ulid();
  }
  // For some odd reason in the Azure ARM API
  // user.name here is actually the user.id.
  // We do not skip existing subscriptions
  // so we can activate a canceled one.
  const subscription = await apiClient.subscription.createOrUpdate(
    lconfig.azurermResourceGroup,
    lconfig.azurermApim,
    subscriptionId,
    {
      displayName: subscriptionId,
      productId: product.id,
      state: "active",
      userId
    }
  );
  return right(subscription);
}

export async function removeUserFromGroups(
  apiClient: ApiManagementClient,
  user: UserContract,
  groups: ReadonlyArray<string>,
  lconfig: IApimConfig = config
): Promise<Either<Error, ReadonlyArray<string>>> {
  if (getApimUser.delete) {
    // invalidate user cache
    getApimUser.delete(apiClient, user.email!);
  }
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

  if (getApimUser.delete) {
    // invalidate user cache
    getApimUser.delete(apiClient, user.email!);
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
  { userEmail, userIdentity, firstName, lastName, note = "" }: IApimUserData,
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
    userIdentity?.id
  );

  try {
    const newApimUser = await apiClient.user.createOrUpdate(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim,
      ulid(),
      {
        email: userEmail,
        firstName,
        lastName,
        note,
        state: "active",
        // identity is optional
        ...(userIdentity ? { identities: [userIdentity] } : {})
      }
    );

    logger.debug(
      "createApimUserIfNotExists|Created new user (%s)",
      JSON.stringify(newApimUser)
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

    // invalidate users cache
    if (getApimUser.delete) {
      getApimUser.delete(apiClient, newApimUser.email!);
    }

    return maybeRetrievedUser;
  } catch (e) {
    logger.error("error %s", e);
    return none;
  }
}

/*
 ** The right full path for ownerID is in this kind of format:
 ** "/subscriptions/subid/resourceGroups/{resourceGroup}/providers/Microsoft.ApiManagement/service/{apimService}/users/5931a75ae4bbd512a88c680b",
 ** resouce link: https://docs.microsoft.com/en-us/rest/api/apimanagement/current-ga/subscription/get
 */
export const parseOwnerIdFullPath = (
  fullPath: NonEmptyString
): NonEmptyString =>
  pipe(
    f => (f as string).split("/"),
    a => a[a.length - 1] as NonEmptyString
  )(fullPath);
