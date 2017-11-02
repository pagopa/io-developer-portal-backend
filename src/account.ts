/**
 * Create API manager users and subscriptions.
 *   
 */
// tslint:disable:no-console
// tslint:disable:no-any
import apiManagementClient = require("azure-arm-apimanagement");

import {
  UserContract,
  UserCreateParameters
} from "azure-arm-apimanagement/lib/models";

import * as config from "./local.config";
import { login } from "./login";

export interface IUserData extends UserCreateParameters {
  oid: string;
  productName: string;
  groups: string[];
}

// import * as crypto from "crypto";
// const toId = (s: string) =>
//   crypto
//     .createHash("sha256")
//     .update(s)
//     .digest("hex");

const getExistingUser = async (
  apiClient: apiManagementClient,
  subscriptionId: string
) => {
  console.log("getExistingUser", subscriptionId);
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
  console.log("addUserToProduct");
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
  console.log("addUserToGroups");
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
  const loginCreds = await login();
  const apiClient = new apiManagementClient(
    (loginCreds as any).creds,
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
