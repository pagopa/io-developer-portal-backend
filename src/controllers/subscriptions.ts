import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import ApiManagementClient from "azure-arm-apimanagement";
import {
  SubscriptionCollection,
  SubscriptionContract
} from "azure-arm-apimanagement/lib/models";
import { isNone, none } from "fp-ts/lib/Option";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import {
  createApimUserIfNotExists,
  getApimUser,
  getUserSubscription,
  getUserSubscriptionManage,
  getUserSubscriptions,
  IExtendedUserContract,
  isAdminUser,
  parseOwnerIdFullPath,
  regeneratePrimaryKey,
  regenerateSecondaryKey
} from "../apim_operations";

import { subscribeApimUser, SubscriptionData } from "../new_subscription";
import { getApimAccountEmail, SessionUser } from "../utils/session";

import { Either, fromOption, isLeft } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import { CIDRsPayload } from "../../generated/api/CIDRsPayload";
import { SubscriptionCIDRs } from "../../generated/api/SubscriptionCIDRs";
import { APIClient, toEither } from "../api_client";
import { AdUser } from "../auth-strategies/azure_ad_strategy";
import { SelfCareUser } from "../auth-strategies/selfcare_session_strategy";
import { manageFlowEnableUserList } from "../config";
import * as config from "../config";
import { getActualUser } from "../middlewares/actual_user";
import { MANAGE_APIKEY_PREFIX } from "../utils/api_key";

export const notificationApiClient = APIClient(
  config.adminApiUrl,
  config.adminApiKey
);

/**
 * List all subscriptions for the logged in user
 */
export async function getSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  userEmail?: EmailString,
  offset?: NonNegativeInteger,
  limit?: NonNegativeInteger,
  subscriptionName?: NonEmptyString
): Promise<
  | IResponseSuccessJson<SubscriptionCollection>
  | IResponseErrorForbiddenNotAuthorized
> {
  const errorOrRetrievedApimUser = await getActualUser(
    apiClient,
    authenticatedUser,
    userEmail
  );
  if (isLeft(errorOrRetrievedApimUser)) {
    return errorOrRetrievedApimUser.value;
  }
  const retrievedApimUser = errorOrRetrievedApimUser.value;

  const subscriptions = await getUserSubscriptions(
    apiClient,
    retrievedApimUser.name,
    offset,
    limit,
    subscriptionName
  );
  return ResponseSuccessJson(subscriptions);
}

export async function initializeSubscriptionCidrs(
  subscriptionId: NonEmptyString
): Promise<Either<Error, SubscriptionCIDRs>> {
  return toEither(
    await notificationApiClient.updateSubscriptionCidrs({
      cidrs: [],
      subscriptionId
    })
  );
}

const isManageFlowDisabled = (retrievedApimUser: IExtendedUserContract) => {
  // if the wildcard "*" is in the enabled user list, every user is enabled (the feature is available to everyone)
  const everyoneIsEnabled =
    manageFlowEnableUserList.indexOf("*" as NonEmptyString) >= 0;
  // we check for the user in the enabled user list
  const userIsEnabled =
    manageFlowEnableUserList.indexOf(
      parseOwnerIdFullPath(retrievedApimUser.id as NonEmptyString)
    ) >= 0;

  // is disabled if both checks are negative
  return !(everyoneIsEnabled || userIsEnabled);
};

/**
 * Get MANAGE subscription for the logged in user (if not exists, create it)
 */
export async function getSubscriptionManage(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  userEmail?: EmailString
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
> {
  const errorOrRetrievedApimUser = await getActualUser(
    apiClient,
    authenticatedUser,
    userEmail
  );
  if (isLeft(errorOrRetrievedApimUser)) {
    return errorOrRetrievedApimUser.value;
  }
  const retrievedApimUser = errorOrRetrievedApimUser.value;

  // Check Manage flow enable user list feature flag
  if (isManageFlowDisabled(retrievedApimUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  // Check User permissions
  if (!retrievedApimUser.groupNames.has("apiservicewrite")) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  // Try to get User Subscription MANAGE
  const maybeSubscriptionManage = await getUserSubscriptionManage(
    apiClient,
    retrievedApimUser.id,
    retrievedApimUser.name
  );
  // Check if Subscription MANAGE exists
  if (isNone(maybeSubscriptionManage)) {
    // Build Subscription MANAGE Data
    const subscriptionData = setSubscriptionDefaults(
      {
        id: MANAGE_APIKEY_PREFIX + retrievedApimUser.name
      } as SubscriptionData,
      authenticatedUser
    );
    // Create MANAGE Subscription only (do not create related Service)
    const subscriptionOrError = await subscribeApimUser(
      apiClient,
      retrievedApimUser,
      subscriptionData,
      false // no service create
    );
    return subscriptionOrError
      .map(async sub => {
        const errorOrInitializedSubscriptionCidrs = await initializeSubscriptionCidrs(
          sub.name as NonEmptyString
        );
        if (isLeft(errorOrInitializedSubscriptionCidrs)) {
          return ResponseErrorInternal("Cannot persist CIDRs");
        }
        return ResponseSuccessJson(sub);
      })
      .fold<
        | IResponseErrorForbiddenNotAuthorized
        | Promise<
            | IResponseErrorInternal
            | IResponseErrorForbiddenNotAuthorized
            | IResponseSuccessJson<SubscriptionContract>
          >
      >(_ => ResponseErrorForbiddenNotAuthorized, identity);
  }
  return ResponseSuccessJson(maybeSubscriptionManage.value);
}

/**
 * Set defaults on an incoming subscription.
 * Defaults may depend on empty values as well as values enforced by the current session user
 *
 * @param source A subscription data object
 * @param authenticatedUser the current session user
 * @returns A subscription data object filled with default fields
 */
const setSubscriptionDefaults = (
  source: SubscriptionData,
  authenticatedUser: SessionUser
): SubscriptionData => {
  const withDefaultsOnEmptyFields = {
    ...source,
    department_name: source.department_name || ("department" as NonEmptyString),
    organization_fiscal_code:
      source.organization_fiscal_code ||
      ("00000000000" as OrganizationFiscalCode),
    organization_name:
      source.organization_name || ("organization" as NonEmptyString),
    service_name: source.service_name || ("service" as NonEmptyString)
  };

  if (SelfCareUser.is(authenticatedUser)) {
    return {
      ...withDefaultsOnEmptyFields,
      organization_fiscal_code: authenticatedUser.organization.fiscal_code,
      organization_name: authenticatedUser.organization.name
    };
  }
  return withDefaultsOnEmptyFields;
};

/**
 * Subscribe the user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
export async function postSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  subscriptionDataInput: SubscriptionData,
  userEmail?: EmailString
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
> {
  const maybeAuthenticatedApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );

  const isAuthenticatedAdmin = maybeAuthenticatedApimUser.exists(isAdminUser);

  // Get the email of the user that must be added to the subscription.
  // It may be the authenticated user or the Active Directory user
  // which has the provided 'userMail' in case the logged in user
  // is the administrator.
  const email =
    isAuthenticatedAdmin && userEmail
      ? userEmail
      : getApimAccountEmail(authenticatedUser);

  // Fill Subscription Data fields with default values
  const subscriptionData = setSubscriptionDefaults(
    subscriptionDataInput,
    authenticatedUser
  );

  const errorOrRetrievedApimUser =
    // As we introduced the principle that an account is ensured for every sessions in a SelfCare context,
    // For Active Directory context, we cannot do the same as we do not have a single point for creating a session token
    // in that case only, a new user will be create
    AdUser.is(authenticatedUser) &&
    // we also check the subscription-creation request also asks for a new user to (eventually) be created
    subscriptionData.new_user &&
    subscriptionData.new_user.email === email
      ? fromOption(ResponseErrorForbiddenNotAuthorized)(
          await createApimUserIfNotExists(apiClient, {
            firstName: subscriptionData.new_user.first_name,
            lastName: subscriptionData.new_user.last_name,
            userEmail: subscriptionData.new_user.email,
            // for backwar compatibility, we link the active directory identity to the created apim user
            userIdentity: {
              id: subscriptionData.new_user.adb2c_id,
              provider: "AadB2C"
            }
          })
        )
      : await getActualUser(apiClient, authenticatedUser, userEmail);

  if (isLeft(errorOrRetrievedApimUser)) {
    return errorOrRetrievedApimUser.value;
  }
  const retrievedApimUser = errorOrRetrievedApimUser.value;

  const subscriptionOrError = await subscribeApimUser(
    apiClient,
    retrievedApimUser,
    subscriptionData
  );
  return subscriptionOrError.fold<
    IResponseErrorInternal | IResponseSuccessJson<SubscriptionContract>
  >(
    err => ResponseErrorInternal("Cannot add new subscription: " + err),
    ResponseSuccessJson
  );
}

/**
 * Get Subscription CIDRs
 * IMPORTANT: This API is intended to use only with Manage Flow
 */
export async function getSubscriptionCIDRs(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  subscriptionId: NonEmptyString
): Promise<
  | IResponseSuccessJson<SubscriptionCIDRs>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
> {
  const maybeAuthenticatedApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );

  const isAuthenticatedAdmin = maybeAuthenticatedApimUser.exists(isAdminUser);

  // This API is intented to use only for Admin
  if (!isAuthenticatedAdmin) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  const errorOrSubscriptionCidrsResponse = toEither(
    await notificationApiClient.getSubscriptionCidrs({
      subscriptionId
    })
  );
  if (isLeft(errorOrSubscriptionCidrsResponse)) {
    return ResponseErrorInternal("Error on get Subscription CIDRs");
  }
  return ResponseSuccessJson(errorOrSubscriptionCidrsResponse.value);
}

/**
 * Update Subscription CIDRs
 * IMPORTANT: This API is intended to use only with Manage Flow
 */
export async function putSubscriptionCIDRs(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  subscriptionId: NonEmptyString,
  cidrsPayload: CIDRsPayload
): Promise<
  | IResponseSuccessJson<SubscriptionCIDRs>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
> {
  const maybeAuthenticatedApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );

  const isAuthenticatedAdmin = maybeAuthenticatedApimUser.exists(isAdminUser);

  // This API is intented to use only for Admin
  if (!isAuthenticatedAdmin) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  const errorOrUpdateSubscriptionCidrsResponse = toEither(
    await notificationApiClient.updateSubscriptionCidrs({
      cidrs: cidrsPayload,
      subscriptionId
    })
  );
  if (isLeft(errorOrUpdateSubscriptionCidrsResponse)) {
    return ResponseErrorInternal("Error on retrieve updated CIDRs");
  }
  return ResponseSuccessJson(errorOrUpdateSubscriptionCidrsResponse.value);
}

/**
 * Regenerate keys for an existing subscription
 * belonging to the logged in user.
 */
export async function putSubscriptionKey(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  subscriptionId: NonEmptyString,
  keyType: NonEmptyString
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );
  if (isNone(maybeUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }
  const user = maybeUser.value;

  const maybeSubscription = await getUserSubscription(
    apiClient,
    subscriptionId,
    user.id
  );
  if (isNone(maybeSubscription)) {
    return ResponseErrorNotFound(
      "Subscription not found",
      "Cannot find a subscription for the logged in user"
    );
  }
  const subscription = maybeSubscription.value;

  const maybeUpdatedSubscription =
    keyType === "secondary_key"
      ? await regenerateSecondaryKey(apiClient, subscription.name, user.id)
      : keyType === "primary_key"
      ? await regeneratePrimaryKey(apiClient, subscription.name, user.id)
      : none;

  return maybeUpdatedSubscription.fold<
    IResponseErrorInternal | IResponseSuccessJson<SubscriptionContract>
  >(
    ResponseErrorInternal("Cannot update subscription to renew key"),
    ResponseSuccessJson
  );
}
