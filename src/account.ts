/**
 * Methods used to add users to API manager Products and Groups.
 */
import { ApiManagementClient } from "azure-arm-apimanagement";
import * as winston from "winston";

import {
  SubscriptionContract,
  UserContract,
  UserCreateParameters
} from "azure-arm-apimanagement/lib/models";

import * as config from "./config";

import * as cuid from "cuid";

export interface IUserData extends UserCreateParameters {
  readonly oid: string;
  readonly productName: string;
  readonly groups: ReadonlyArray<string>;
}

export const getUserSubscriptions = async (
  apiClient: ApiManagementClient,
  userId: string
) => {
  winston.debug("getUserSubscriptions");
  // TODO: this list is paginated with a next-link
  // by now we get only the first result page
  return apiClient.userSubscription.list(
    config.azurermResourceGroup,
    config.azurermApim,
    userId
  );
};

const getExistingUser = async (
  apiClient: ApiManagementClient,
  userId: string
) => {
  winston.debug("getExistingUser");
  return apiClient.user.get(
    config.azurermResourceGroup,
    config.azurermApim,
    userId
  );
};

const addUserToProduct = async (
  apiClient: ApiManagementClient,
  user: UserContract,
  productName: string
) => {
  winston.debug("addUserToProduct");
  const product = await apiClient.product.get(
    config.azurermResourceGroup,
    config.azurermApim,
    productName
  );
  if (user && user.id && user.name && product && product.id && productName) {
    const subscriptionId = cuid();
    // For some odd reason in the Azure ARM API
    // user.name here is actually the user.id.
    // We do not skip existing subscriptions
    // so we can activate a canceled one.
    return apiClient.subscription.createOrUpdate(
      config.azurermResourceGroup,
      config.azurermApim,
      subscriptionId,
      {
        displayName: subscriptionId,
        productId: product.id,
        state: "active",
        userId: user.id
      }
    );
  } else {
    return Promise.reject(
      new Error("Cannot find API manager product for update")
    );
  }
};

const addUserToGroups = async (
  apiClient: ApiManagementClient,
  user: UserContract,
  groups: ReadonlyArray<string>
) => {
  winston.debug("addUserToGroups");
  if (!user || !user.name) {
    return Promise.reject(new Error("Cannot parse user"));
  }
  const existingGroups = await apiClient.userGroup.list(
    config.azurermResourceGroup,
    config.azurermApim,
    user.name
  );
  const existingGroupsNames = new Set(existingGroups.map(g => g.name));
  winston.debug("addUserToGroups|groups|", existingGroupsNames);
  const missingGroups = new Set(
    groups.filter(g => !existingGroupsNames.has(g))
  );
  if (missingGroups.size === 0) {
    winston.debug(
      "addUserToGroups|user already belongs to groups|",
      existingGroupsNames
    );
    return Promise.resolve(user);
  }
  // sequence the promises here as calling this method
  // concurrently seems to cause some oddities assigning
  // users to groups
  return groups.reduce((prev, group) => {
    // For some odd reason in the Azure ARM API user.name here is
    // in reality the user.id
    return prev.then(_ => {
      return apiClient.groupUser.create(
        config.azurermResourceGroup,
        config.azurermApim,
        group,
        user.name as string
      );
    });
  }, Promise.resolve({} as UserContract));
};

/**
 * Assign an existing API user to products and groups.
 *
 * @param userId                                  the id of user
 * @param userData                                profile data (ie. email, name)
 * @param loginCreds                              client credentials (service principal)
 * @param dangerouslySkipAuthenticationCheck      useful in case you want to call the method locally
 */
export const updateApimUser = async (
  apiClient: ApiManagementClient,
  userId: string,
  userData: IUserData,
  dangerouslySkipAuthenticationCheck = false
): Promise<SubscriptionContract> => {
  winston.debug("updateApimUser");
  const user = await getExistingUser(apiClient, userId);
  if (
    !dangerouslySkipAuthenticationCheck &&
    (!user.identities ||
      !user.identities[0] ||
      user.identities[0].provider !== "AadB2C" ||
      user.identities[0].id !== userData.oid)
  ) {
    throw new Error("updateApimUser|profile.oid != user.id");
  }
  await addUserToGroups(apiClient, user, userData.groups);
  return addUserToProduct(apiClient, user, userData.productName);
};
