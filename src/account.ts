/**
 * Methods used to add users to API manager Products and Groups.
 */
import apiManagementClient = require("azure-arm-apimanagement");
import * as winston from "winston";

import {
  UserContract,
  UserCreateParameters
} from "azure-arm-apimanagement/lib/models";

import * as config from "./local.config";
import { login } from "./login";

export interface IUserData extends UserCreateParameters {
  readonly oid: string;
  readonly productName: string;
  readonly groups: ReadonlyArray<string>;
}

const getExistingUser = async (
  apiClient: apiManagementClient,
  subscriptionId: string
) => {
  winston.log("debug", "getExistingUser");
  return apiClient.user.get(
    config.azurerm_resource_group,
    config.azurerm_apim,
    subscriptionId
  );
};

const addUserToProduct = async (
  apiClient: apiManagementClient,
  user: UserContract,
  productName: string
) => {
  winston.log("debug", "addUserToProduct");
  const product = await apiClient.product.get(
    config.azurerm_resource_group,
    config.azurerm_apim,
    productName
  );
  if (user && user.id && user.name && product && product.id) {
    return apiClient.subscription.createOrUpdate(
      config.azurerm_resource_group,
      config.azurerm_apim,
      `sid-${user.name}-${productName}`,
      {
        displayName: `sid-${user.name}-${productName}`,
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

const addUserToGroups = (
  apiClient: apiManagementClient,
  user: UserContract,
  groups: ReadonlyArray<string>
) => {
  winston.log("debug", "addUserToGroups");
  return Promise.all(
    groups.map(async group => {
      if (user && user.name) {
        return await apiClient.groupUser.create(
          config.azurerm_resource_group,
          config.azurerm_apim,
          group,
          user.name
        );
      } else {
        return Promise.reject("Error while adding user to group");
      }
    })
  );
};

export const createOrUpdateApimUser = async (
  subscriptionId: string,
  userData: IUserData
): Promise<void> => {
  winston.log("debug", "createOrUpdateApimUser");
  const loginCreds = await login();
  const apiClient = new apiManagementClient(
    loginCreds.creds,
    loginCreds.subscriptionId
  );
  const user = await getExistingUser(apiClient, subscriptionId);
  if (
    !user.identities ||
    !user.identities[0] ||
    user.identities[0].provider !== "AadB2C" ||
    user.identities[0].id !== userData.oid
  ) {
    throw new Error("createOrUpdateApimUser|profile.oid != user.id");
  }
  await addUserToGroups(apiClient, user, userData.groups);
  await addUserToProduct(apiClient, user, userData.productName);
};
