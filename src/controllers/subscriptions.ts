import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
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
  getUserSubscriptions,
  isAdminUser,
  regeneratePrimaryKey,
  regenerateSecondaryKey
} from "../apim_operations";

import { subscribeApimUser, SubscriptionData } from "../new_subscription";
import {
  getApimAccountAnnotation,
  getApimAccountEmail,
  SessionUser
} from "../utils/session";

import { ClaimProcedureStatus } from "@pagopa/io-selfcare-subscription-migrations-sdk/ClaimProcedureStatus";
import { createClient as createSubsctiptionMigrationsClient } from "@pagopa/io-selfcare-subscription-migrations-sdk/client";
import {
  IResponseErrorValidation,
  ResponseErrorValidation
} from "@pagopa/ts-commons/lib/responses";
import { fromOption, isLeft } from "fp-ts/lib/Either";
import { readableReport } from "italia-ts-commons/lib/reporters";
import nodeFetch from "node-fetch";
import { SelfCareUser } from "../auth-strategies/selfcare_session_strategy";
import * as config from "../config";
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
          await createApimUserIfNotExists(apiClient, {
            firstName: subscriptionData.new_user.first_name,
            lastName: subscriptionData.new_user.last_name,
            note: getApimAccountAnnotation(authenticatedUser),
            userAdId: subscriptionData.new_user.adb2c_id,
            userEmail: subscriptionData.new_user.email
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

/**
 * Retrieve status for an ownership claim
 *
 * @param authenticatedUser
 * @param delegateId
 * @returns
 */
export async function getOwnershipClaimStatus(
  authenticatedUser: SessionUser,
  delegateId: NonEmptyString
): Promise<
  | IResponseSuccessJson<ClaimProcedureStatus>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorValidation
  | IResponseErrorForbiddenNotAuthorized
> {
  if (SelfCareUser.is(authenticatedUser)) {
    const client = createSubsctiptionMigrationsClient<"SubscriptionKey">({
      basePath: "",
      baseUrl: config.SUBSCRIPTION_MIGRATIONS_URL,
      fetchApi: (nodeFetch as unknown) as typeof fetch,
      withDefaults: op => params => {
        const c = op({
          ...params,
          SubscriptionKey: config.SUBSCRIPTION_MIGRATIONS_APIKEY
        });
        return c;
      }
    });

    const proxied = await client.getOwnershipClaimStatus({
      delegate_id: delegateId,
      organization_fiscal_code: authenticatedUser.organization.fiscal_code
    });
    return proxied.fold(
      err =>
        ResponseErrorInternal(
          `Failed to decode response, ${readableReport(err)}`
        ),
      res => {
        switch (res.status) {
          case 200:
            return ResponseSuccessJson(res.value);
          case 400:
            return ResponseErrorValidation("Bad Request", "Bad Request");
          case 401:
            return ResponseErrorForbiddenNotAuthorized;
          case 404:
            return ResponseErrorNotFound(
              "Not Found",
              `No subscription is associated with delegate ${delegateId}`
            );
          case 500:
            return ResponseErrorInternal(res.value.detail || "");
          default:
            // exhaustive check
            const _: never = res;
            return ResponseErrorInternal(
              `Received unexpected status: ${
                (_ as any).status /* tslint:disable-line: no-any */
              }`
            );
        }
      }
    );
  } else {
    // Subscription migration is allowed only in SelfCare context
    return ResponseErrorForbiddenNotAuthorized;
  }
}
