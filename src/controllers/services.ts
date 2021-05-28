import ApiManagementClient from "azure-arm-apimanagement";
import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
import {
  IResponseErrorConflict,
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  IResponseSuccessRedirectToResource,
  ResponseErrorConflict,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import {
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import { ServicePublic } from "../../generated/api/ServicePublic";
import { APIClient, toEither } from "../api_client";
import {
  getApimUser,
  getUserSubscription,
  isAdminUser
} from "../apim_operations";
import { AdUser } from "../bearer_strategy";
import * as config from "../config";

import { withDefault } from "italia-ts-commons/lib/types";
import { Service } from "../../generated/api/Service";
import { logger } from "../logger";

import * as t from "io-ts";

import { DepartmentName } from "../../generated/api/DepartmentName";
import { Logo as ApiLogo } from "../../generated/api/Logo";
import { MaxAllowedPaymentAmount } from "../../generated/api/MaxAllowedPaymentAmount";
import { OrganizationName } from "../../generated/api/OrganizationName";
import { ServiceId } from "../../generated/api/ServiceId";
import { ServiceMetadata } from "../../generated/api/ServiceMetadata";
import { ServiceName } from "../../generated/api/ServiceName";

import {
  IResponseSuccessAccepted,
  ResponseErrorForbiddenNotAuthorized,
  ResponseSuccessAccepted
} from "@pagopa/ts-commons/lib/responses";
import { identity } from "fp-ts/lib/function";
import { fromPredicate, taskEither } from "fp-ts/lib/TaskEither";
import { CIDR } from "../../generated/api/CIDR";
import { IJiraAPIClient, SearchJiraIssueResponse } from "../jira_client";
import {
  checkAdminTask,
  getApimUserTask,
  getUserSubscriptionTask,
  uploadOrganizationLogoTask,
  uploadServiceLogoTask
} from "../middlewares/upload_logo";
import { getServicePayloadUpdater } from "../utils/conversions";

export const ServicePayload = t.partial({
  authorized_cidrs: t.readonlyArray(CIDR, "array of CIDR"),
  authorized_recipients: t.readonlyArray(FiscalCode, "array of FiscalCode"),
  department_name: DepartmentName,
  is_visible: withDefault(t.boolean, false),
  max_allowed_payment_amount: MaxAllowedPaymentAmount,
  organization_fiscal_code: OrganizationFiscalCode,
  organization_name: OrganizationName,
  service_metadata: ServiceMetadata,
  service_name: ServiceName
});
export type ServicePayload = t.TypeOf<typeof ServicePayload>;

export const notificationApiClient = APIClient(
  config.adminApiUrl,
  config.adminApiKey
);

export type ErrorResponses =
  | IResponseErrorNotFound
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

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

  const updatedService = getServicePayloadUpdater(authenticatedApimUser)(
    service,
    servicePayload
  );
  logger.debug("updating service %s", JSON.stringify(updatedService));

  const errorOrUpdatedService = toEither(
    await notificationApiClient.updateService({
      service: updatedService,
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

/**
 * Upload service logo for/with a specific serviceId.
 */
export async function putServiceLogo(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: ServiceId,
  serviceLogo: ApiLogo
): Promise<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses> {
  return getApimUserTask(apiClient, authenticatedUser)
    .chain(user => getUserSubscriptionTask(apiClient, serviceId, user))
    .chain(() => uploadServiceLogoTask(serviceId, serviceLogo))
    .fold<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses>(
      identity,
      identity
    )
    .run();
}

/**
 * Upload organization logo for/with a specific serviceId.
 */
export async function putOrganizationLogo(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  organizationFiscalCode: OrganizationFiscalCode,
  serviceLogo: ApiLogo
): Promise<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses> {
  return getApimUserTask(apiClient, authenticatedUser)
    .chain(user => checkAdminTask(user))
    .chain(() =>
      uploadOrganizationLogoTask(organizationFiscalCode, serviceLogo)
    )
    .fold<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses>(
      identity,
      identity
    )
    .run();
}

export async function newReviewRequest(
  apiClient: ApiManagementClient,
  jiraClient: IJiraAPIClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString,
  jiraConfig: config.IJIRA_CONFIG
): Promise<
  | IResponseSuccessAccepted
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorConflict
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

  // An admin cannot require a Service Review
  if (isAdminUser(authenticatedApimUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  // if the user is an admin we skip the check on userId
  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    authenticatedApimUser.id
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

  // TODO: Check if a Review is still in progress for the service
  return (
    jiraClient
      .getServiceJiraIssuesByStatus({
        serviceId: service.service_id,
        status: jiraConfig.JIRA_STATUS_IN_PROGRESS
      })
      .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(_ =>
        ResponseErrorInternal(_.message)
      )
      .chain(
        fromPredicate(
          _ => _.total === 0,
          _ =>
            ResponseErrorConflict(
              "A review is already in progress for the service"
            )
        )
      )
      // TODO: If exists Rejected Issue move blocked Jira Issue to NEW status
      .chainSecond(
        jiraClient
          .getServiceJiraIssuesByStatus({
            serviceId: service.service_id,
            status: jiraConfig.JIRA_STATUS_REJECTED
          })
          .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(_ =>
            ResponseErrorInternal(_.message)
          )
      )
      .chain(rejectedIssues =>
        fromPredicate<undefined, SearchJiraIssueResponse>(
          _ => _.issues.length > 0,
          _ => void 0
        )(rejectedIssues).foldTaskEither(
          _ => taskEither.of(rejectedIssues),
          _ => {
            // TODO: Move rejected issue into new
            return taskEither.of(_);
          }
        )
      )
      .chainSecond(
        jiraClient
          .getServiceJiraIssuesByStatus({
            serviceId: service.service_id,
            status: jiraConfig.JIRA_STATUS_NEW
          })
          .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(_ =>
            ResponseErrorInternal(_.message)
          )
      )
      .chain(_ => {
        if (_.issues.length > 0) {
          return jiraClient
            .createJiraIssueComment(
              _.issues[0].id,
              "Il delegato ha richiesto una nuova review" as NonEmptyString
            )
            .map(__ =>
              ResponseSuccessAccepted<undefined>(
                "Created new comment on existing issue"
              )
            )
            .mapLeft(err => ResponseErrorInternal(err.message));
        } else {
          return jiraClient
            .createJiraIssue(
              `Richiesta di Review servizio ${service.service_id}` as NonEmptyString,
              `Effettua la review del servizio al link https://developer.io.italia.it/service/${service.service_id}` as NonEmptyString,
              service.service_id
            )
            .map(__ => ResponseSuccessAccepted<undefined>("Create new Issue"))
            .mapLeft(err => ResponseErrorInternal(err.message));
        }
      })
      .fold<
        | IResponseSuccessAccepted
        | IResponseErrorForbiddenNotAuthorized
        | IResponseErrorConflict
        | IResponseErrorInternal
        | IResponseErrorNotFound
      >(identity, identity)
      .run()
  );
}
