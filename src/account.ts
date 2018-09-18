/**
 * Methods used to add users to API manager Products and Groups.
 */
import { ApiManagementClient } from "azure-arm-apimanagement";
import * as msRestAzure from "ms-rest-azure";
import * as winston from "winston";

import {
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

export async function newApiClient(): Promise<ApiManagementClient> {
  const loginCreds = await msRestAzure.loginWithAppServiceMSI();
  return new ApiManagementClient(loginCreds, config.subscriptionId);
}

export const getUserSubscription = async (
  apiClient: ApiManagementClient,
  subscriptionId: string
) => {
  winston.debug("getUserSubscription");
  return apiClient.subscription.get(
    config.azurermResourceGroup,
    config.azurermApim,
    subscriptionId
  );
};

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

export const getApimUser = async (
  apiClient: ApiManagementClient,
  email: string
) => {
  winston.debug("getApimUser");
  const results = await apiClient.user.listByService(
    config.azurermResourceGroup,
    config.azurermApim,
    { filter: "email eq " + email }
  );
  if (!results || results.length === 0) {
    return undefined;
  }
  return results[0];
};

export const getExistingUser = async (
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

export const addUserSubscriptionToProduct = async (
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

export const addUserToGroups = async (
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
