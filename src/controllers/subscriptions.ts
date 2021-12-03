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
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  createApimUserIfNotExists,
  getApimUser,
  getUserSubscription,
  getUserSubscriptions,
  isAdminUser,
  regeneratePrimaryKey,
  regenerateSecondaryKey
} from "../apim_operations";
<<<<<<< HEAD
=======
import { getApimAccountEmail, SessionUser } from "../utils/session";
>>>>>>> 005792f... create lens for apim account email
import { subscribeApimUser, SubscriptionData } from "../new_subscription";
import { getApimAccountEmail, SessionUser } from "../utils/session";

import { fromOption, isLeft } from "fp-ts/lib/Either";
import { getActualUser } from "../middlewares/actual_user";

/**
 * List all subscriptions for the logged in user
 */
export async function getSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  userEmail?: EmailString
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
    retrievedApimUser.name
  );
  return ResponseSuccessJson(subscriptions);
}

/**
 * Subscribe the user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
export async function postSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  subscriptionData: SubscriptionData,
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

  const errorOrRetrievedApimUser =
    subscriptionData.new_user && subscriptionData.new_user.email === email
      ? fromOption(ResponseErrorForbiddenNotAuthorized)(
          await createApimUserIfNotExists(
            apiClient,
            subscriptionData.new_user.email,
            subscriptionData.new_user.adb2c_id,
            subscriptionData.new_user.first_name,
            subscriptionData.new_user.last_name
          )
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
