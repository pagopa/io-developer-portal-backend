import ApiManagementClient from "azure-arm-apimanagement";
import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Service } from "../api/Service";
import { ServicePublic } from "../api/ServicePublic";
import { APIClient, toEither } from "../api_client";
import { getApimUser, getUserSubscription } from "../apim_operations";
import { AdUser } from "../bearer_strategy";
import * as config from "../config";

const notificationApiClient = APIClient(config.adminApiUrl, config.adminApiKey);

/**
 * Get service data for a specific serviceId.
 */
export async function getService(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString
): Promise<
  | IResponseSuccessJson<ServicePublic>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );
  if (isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const apimUser = maybeApimUser.value;

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    apimUser.id
  );
  if (isNone(maybeSubscription)) {
    return ResponseErrorInternal("Cannot get user subscription");
  }

  const errorOrServiceResponse = toEither<ServicePublic>(
    await notificationApiClient.getService({
      id: serviceId
    })
  );

  if (isLeft(errorOrServiceResponse)) {
    return ResponseErrorNotFound(
      "Cannot get service",
      "Cannot get existing service"
    );
  }

  return ResponseSuccessJson(errorOrServiceResponse.value);
}

/**
 * Update service data for/with a specific serviceId.
 */
export async function putService(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString,
  servicePayload: Service
): Promise<
  | IResponseSuccessJson<ServicePublic>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );
  if (isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const apimUser = maybeApimUser.value;

  // Authenticates this request against the logged in user
  // checking that he owns a subscription with the provided serviceId
  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    apimUser.id
  );
  if (isNone(maybeSubscription)) {
    return ResponseErrorNotFound(
      "Subscription not found",
      "Cannot get a subscription for the logged in user"
    );
  }

  // TODO: get the old service then filter only
  // authorized fields and merge the changes
  const errorOrService = toEither(
    await notificationApiClient.updateService({
      service: servicePayload,
      serviceId
    })
  );

  return errorOrService.fold<
    IResponseErrorInternal | IResponseSuccessJson<ServicePublic>
  >(
    errs => ResponseErrorInternal("Error updating service: " + errs.message),
    ResponseSuccessJson
  );
}
