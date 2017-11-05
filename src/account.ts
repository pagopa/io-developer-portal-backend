/**
 * Methods used to add users to API manager Products and Groups.
 */
import apiManagementClient = require("azure-arm-apimanagement");
import * as winston from "winston";

import {
  SubscriptionContract,
  UserContract,
  UserCreateParameters
} from "azure-arm-apimanagement/lib/models";

import * as config from "./config";
import { login } from "./login";

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
  apiClient: apiManagementClient,
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
  apiClient: apiManagementClient,
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
    const subscriptionId = userIdToSubscriptionId(user.name, productName);
    // Get subscription for this user-product
    try {
      const subscription = await apiClient.subscription.get(
        config.azurermResourceGroup,
        config.azurermApim,
        subscriptionId
      );
      // Skip adding subscription if already existing
      if (subscription) {
        winston.debug(
          "addUserToProduct|success|found existing subscription, skipping"
        );
        return subscription;
      }
    } catch (e) {
      winston.debug("addUserToProduct|success|existing subscription not found");
    }
    // For some odd reason in the Azure ARM API user.name here is
    // in reality the user.id
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
  apiClient: apiManagementClient,
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

export const createOrUpdateApimUser = async (
  userId: string,
  userData: IUserData
): Promise<SubscriptionContract> => {
  winston.debug("createOrUpdateApimUser");
  const loginCreds = await login();
  const apiClient = new apiManagementClient(
    loginCreds.creds,
    loginCreds.subscriptionId
  );
  const user = await getExistingUser(apiClient, userId);
  if (
    !user.identities ||
    !user.identities[0] ||
    user.identities[0].provider !== "AadB2C" ||
    user.identities[0].id !== userData.oid
  ) {
    throw new Error("createOrUpdateApimUser|profile.oid != user.id");
  }
  await addUserToGroups(apiClient, user, userData.groups);
  return addUserToProduct(apiClient, user, userData.productName);
};
