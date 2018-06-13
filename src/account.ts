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

import * as msRest from "ms-rest";
import * as config from "./config";

import * as crypto from "crypto";

export interface IUserData extends UserCreateParameters {
  readonly oid: string;
  readonly productName: string;
  readonly groups: ReadonlyArray<string>;
}

/**
 *  Assigns a deterministic / predicatable id to the user's subscription.
 *  Useful in case we want to retrieve it later.
 */
export const userIdToSubscriptionId = (userId: string, productName: string) =>
  // do not use dashes here as it does not play well
  // together with the version field of the Service entity
  `${userId}${crypto
    .createHash("md5")
    .update(productName)
    .digest("hex")
    .substring(0, 4)}`;

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
    // For some odd reason in the Azure ARM API user.name here is
    // in reality the user.id
    const subscriptionId = userIdToSubscriptionId(user.name, productName);
    // We do not skip existing subscriptions so we can activate a canceled one.
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
  return Promise.all(
    groups.map(async group => {
      // For some odd reason in the Azure ARM API user.name here is
      // in reality the user.id
      return await apiClient.groupUser.create(
        config.azurermResourceGroup,
        config.azurermApim,
        group,
        user.name as string
      );
    })
  );
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
  userId: string,
  userData: IUserData,
  loginCreds: msRest.ServiceClientCredentials,
  dangerouslySkipAuthenticationCheck = false
): Promise<SubscriptionContract> => {
  winston.debug("updateApimUser");
  const apiClient = new ApiManagementClient(loginCreds, config.subscriptionId);
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
