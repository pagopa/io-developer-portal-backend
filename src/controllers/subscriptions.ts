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
  getApimUser,
  getUserSubscription,
  getUserSubscriptions,
  regeneratePrimaryKey,
  regenerateSecondaryKey
} from "../apim_operations";
import { AdUser } from "../bearer_strategy";
import { subscribeApimUser } from "../new_subscription";

import { isEmpty } from "fp-ts/lib/Array";
import { logger } from "../logger";

/**
 * List all subscriptions for the logged in user
 */
export async function getSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  userEmail?: EmailString
): Promise<
  | IResponseSuccessJson<SubscriptionCollection>
  | IResponseErrorForbiddenNotAuthorized
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );

  const isApimAdmin = maybeApimUser.exists(
    apimUser =>
      Array.isArray(apimUser.groups) &&
      !isEmpty(apimUser.groups.filter(g => g.displayName === "Administrator"))
  );

  // If the logged in user is an administrator and we have
  // an email address, load the actual user from that address
  const maybeRetrievedApimUser =
    userEmail && isApimAdmin
      ? await getApimUser(apiClient, userEmail)
      : maybeApimUser;

  logger.debug(
    "getSubscriptions, isAdmin=%d groups=%s",
    isApimAdmin,
    JSON.stringify(maybeApimUser)
  );

  if (isNone(maybeRetrievedApimUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }
  const retrievedApimUser = maybeRetrievedApimUser.value;

  const subscriptions = await getUserSubscriptions(
    apiClient,
    retrievedApimUser.name
  );
  return ResponseSuccessJson(subscriptions);
}

/**
 * Subscribe the logged in user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
export async function postSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
> {
  const user = await getApimUser(apiClient, authenticatedUser.emails[0]);
  if (isNone(user)) {
    return ResponseErrorForbiddenNotAuthorized;
  }
  const subscriptionOrError = await subscribeApimUser(
    apiClient,
    authenticatedUser
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
  authenticatedUser: AdUser,
  subscriptionId: NonEmptyString,
  keyType: NonEmptyString
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeUser = await getApimUser(apiClient, authenticatedUser.emails[0]);
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
