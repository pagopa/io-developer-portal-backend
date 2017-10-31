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
  uid: string;
  productName: string;
  groups: string[];
}

const addUserToProduct = async (
  apiClient: apiManagementClient,
  user: UserContract,
  productName: string
) => {
  const product = await apiClient.product.get(
    config.azurerm_resource_group,
    config.azurerm_apim,
    productName
  );
  if (user && user.id && product && product.id) {
    apiClient.subscription.createOrUpdate(
      config.azurerm_resource_group,
      config.azurerm_apim,
      `sid-${user.email}-${productName}`,
      {
        displayName: `sid-${user.email}-${productName}`,
        productId: product.id,
        state: "active",
        userId: user.id
      }
    );
  }
};

const createOrUpdateUser = (
  apiClient: apiManagementClient,
  userId: string,
  user: UserCreateParameters
) =>
  apiClient.user.createOrUpdate(
    config.azurerm_resource_group,
    config.azurerm_apim,
    userId,
    user
  );

const addUserToGroups = (
  apiClient: apiManagementClient,
  user: UserContract,
  groups: ReadonlyArray<string>
) => {
  Promise.all(
    groups.map(async group => {
      if (user && user.email) {
        return await apiClient.groupUser.create(
          config.azurerm_resource_group,
          config.azurerm_apim,
          group,
          user.email
        );
      }
      return Promise.resolve();
    })
  );
};

export const createOrUpdateApimUser = async (userData: IUserData): Promise<void> => {
  const loginCreds = await login();
  const apiClient = new apiManagementClient(
    (loginCreds as any).creds,
    loginCreds.subscriptionId
  );
  const user = await createOrUpdateUser(apiClient, userData.uid, userData);
  await addUserToGroups(apiClient, user, userData.groups);
  await addUserToProduct(apiClient, user, userData.productName);
};
