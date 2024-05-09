/**
 * Methods used to
 * - add users to Azure API management Products and Groups
 * - manage subscriptions and subscriptions keys
 *
 * See https://docs.microsoft.com/en-us/rest/api/apimanagement/
 */
import { asyncIteratorToArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
import { Set } from "json-set-map";
import * as memoizee from "memoizee";
import { logger } from "./logger";

import * as config from "./config";

import {
  ApiManagementClient,
  SubscriptionCollection,
  SubscriptionContract,
  UserContract,
  UserIdentityContract
} from "@azure/arm-apimanagement";
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
  // TODO: probabilmente serve il metodo che estrae l'id, ownerId è un path
  if ((userId && subscription.ownerId !== userId) || !subscription.name) {
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
      if ((userId && subscription.ownerId !== userId) || !subscription.name) {
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
  const subContract = await asyncIteratorToArray(
    apiClient.userSubscription.list(
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
    )
  );

  return {
    value: Array.from(subContract)
  };
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
  readonly groupDisplayNames?: SerializableSet<string>;
}

interface IApimGroups {
  readonly groupNames: ReadonlyArray<string>;
  readonly groupDisplayNames: ReadonlyArray<string>;
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

  const results = await asyncIteratorToArray(
    apiClient.user.listByService(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim,
      { filter: "email eq '" + email + "'" }
    )
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
  const groupResponse = await getUserGroups(apiClient, user, lconfig);
  const apimUser = {
    email: user.email,
    id: user.id,
    name: user.name,
    ...user,
    groupDisplayNames: isSome(groupResponse)
      ? new Set(groupResponse.value.groupDisplayNames)
      : (new Set() as SerializableSet<string>),
    groupNames: isSome(groupResponse)
      ? new Set(groupResponse.value.groupNames)
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
      scope: `/products/${product.id}`,
      state: "active",
      ownerId: userId
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
      await apiClient.groupUser.delete(
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
  const existingGroups = await asyncIteratorToArray(
    apiClient.userGroup.list(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim,
      user.name
    )
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
): Promise<Option<IApimGroups>> {
  if (!user.name) {
    return none;
  }
  const existingGroups = await asyncIteratorToArray(
    apiClient.userGroup.list(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim,
      user.name
    )
  );

  // obtain 2 lists of groups:
  // - one containing the groupNames
  // - one containing the groups DisplayName

  return some({
    groupDisplayNames: existingGroups.map(g => g.displayName) as ReadonlyArray<
      string
    >,
    groupNames: existingGroups.map(g => g.name) as ReadonlyArray<string>
  });
}

export async function getApimUsers(
  apiClient: ApiManagementClient,
  lconfig: IApimConfig = config
): Promise<ReadonlyArray<UserContract>> {
  // tslint:disable-next-line:readonly-array no-let
  logger.debug("getUsers");
  return asyncIteratorToArray(
    apiClient.user.listByService(
      lconfig.azurermResourceGroup,
      lconfig.azurermApim
    )
  );
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
