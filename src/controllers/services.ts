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
import { ServicePublic } from "../api/ServicePublic";
import { APIClient, toEither } from "../api_client";
import {
  getApimUser,
  getUserSubscription,
  isAdminUser
} from "../apim_operations";
import { AdUser } from "../bearer_strategy";
import * as config from "../config";

import { pick } from "italia-ts-commons/lib/types";
import { Service } from "../api/Service";
import { logger } from "../logger";

export type ServicePayload = Service;

const notificationApiClient = APIClient(config.adminApiUrl, config.adminApiKey);

/**
 * Get service data for a specific serviceId.
 */
export async function getService(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString
): Promise<
  | IResponseSuccessJson<Service>
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
  // if the user is an admin we skip the check on userId
  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    isAdminUser(apimUser) ? undefined : apimUser.id
  );

  if (isNone(maybeSubscription)) {
    return ResponseErrorInternal("Cannot get user subscription");
  }

  const errorOrServiceResponse = toEither(
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
  const service = errorOrServiceResponse.value;
  return ResponseSuccessJson(service);
}

/**
 * Update service data for/with a specific serviceId.
 */
export async function putService(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString,
  servicePayload: ServicePayload
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
  const authenticatedApimUser = maybeApimUser.value;

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  // if the user is an admin we skip the check on userId
  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    isAdminUser(authenticatedApimUser) ? undefined : authenticatedApimUser.id
  );
  if (isNone(maybeSubscription)) {
    return ResponseErrorNotFound(
      "Subscription not found",
      "Cannot get a subscription for the logged in user"
    );
  }

  // Get old service data
  const errorOrService = toEither(
    await notificationApiClient.getService({
      id: serviceId
    })
  );
  if (isLeft(errorOrService)) {
    return ResponseErrorNotFound(
      "Service not found",
      "Cannot get a service with the provided id."
    );
  }
  const service = errorOrService.value;

  logger.debug(
    "updating service %s",
    JSON.stringify({ ...service, ...servicePayload })
  );

  const payload = !isAdminUser(authenticatedApimUser)
    ? pick(
        [
          "department_name",
          "organization_fiscal_code",
          "organization_name",
          "service_name"
        ],
        servicePayload
      )
    : servicePayload;

  const errorOrUpdatedService = toEither(
    await notificationApiClient.updateService({
      service: { ...service, ...payload },
      serviceId
    })
  );

  return errorOrUpdatedService.fold<
    IResponseErrorInternal | IResponseSuccessJson<ServicePublic>
  >(
    errs => ResponseErrorInternal("Error updating service: " + errs.message),
    ResponseSuccessJson
  );
}
