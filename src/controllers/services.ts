import ApiManagementClient from "azure-arm-apimanagement";
import { toError } from "fp-ts/lib/Either";
import { fromNullable } from "fp-ts/lib/Option";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { ServicePublic } from "../../generated/api/ServicePublic";
import {
  getApimUser,
  getUserSubscription,
  IExtendedUserContract,
  isAdminUser
} from "../apim_operations";
import { AdUser } from "../bearer_strategy";

import { pick, withDefault } from "italia-ts-commons/lib/types";
import { Service } from "../../generated/api/Service";
import { logger } from "../logger";

import * as t from "io-ts";

import { identity } from "fp-ts/lib/function";
import { fromLeft, taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import {
  CIDR,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import { DepartmentName } from "../../generated/api/DepartmentName";
import { Logo as ApiLogo } from "../../generated/api/Logo";
import { MaxAllowedPaymentAmount } from "../../generated/api/MaxAllowedPaymentAmount";
import { OrganizationName } from "../../generated/api/OrganizationName";
import { ServiceId } from "../../generated/api/ServiceId";
import { ServiceMetadata } from "../../generated/api/ServiceMetadata";
import { ServiceName } from "../../generated/api/ServiceName";
import { notificationApiClient } from "../api_client";
import {
  checkAdminTask,
  getApimUserTask,
  uploadOrganizationLogoTask,
  uploadServiceLogoTask
} from "../middlewares/upload_logo";

export const ServicePayload = t.partial({
  authorized_cidrs: t.readonlyArray(CIDR),
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

export type ErrorResponses =
  | IResponseErrorNotFound
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

const ServiceAndIsAdminUser = t.interface({
  isAdmin: t.boolean,
  service: Service
});

type ServiceAndIsAdminUser = t.TypeOf<typeof ServiceAndIsAdminUser>;

const getServiceTask = (
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString
) =>
  tryCatch(() => getApimUser(apiClient, authenticatedUser.emails[0]), toError)
    .foldTaskEither<
      IResponseErrorInternal | IResponseErrorNotFound,
      IExtendedUserContract
    >(
      e =>
        fromLeft(ResponseErrorInternal(`Cannot get APIM user| ${e.message}`)),
      maybeApimUser =>
        maybeApimUser.foldL(
          () =>
            fromLeft(
              ResponseErrorNotFound(
                "API user not found",
                "Cannot find a user in the API management with the provided email address"
              )
            ),
          _ => taskEither.of(_)
        )
    )
    .chain(apimUser =>
      // Authenticates this request against the logged in user
      // checking that serviceId = subscriptionId
      // if the user is an admin we skip the check on userId
      tryCatch(
        () =>
          getUserSubscription(
            apiClient,
            serviceId,
            isAdminUser(apimUser) ? undefined : apimUser.id
          ),
        toError
      )
        .mapLeft(_ =>
          ResponseErrorInternal(`Cannot get user Subscription| ${_.message}`)
        )
        .foldTaskEither<IResponseErrorInternal, boolean>(
          fromLeft,
          maybeSubscription =>
            maybeSubscription.foldL(
              () =>
                fromLeft(ResponseErrorInternal("No user subscription found")),
              _ => taskEither.of(isAdminUser(apimUser))
            )
        )
    )
    .chain(isAdmin =>
      tryCatch(
        () =>
          notificationApiClient.getService({
            service_id: serviceId
          }),
        toError
      )
        .mapLeft(_ => ResponseErrorInternal(`Cannot get Service| ${_.message}`))
        .foldTaskEither<
          IResponseErrorInternal | IResponseErrorNotFound,
          ServiceAndIsAdminUser
        >(fromLeft, errorOrResponse =>
          errorOrResponse.fold(
            errs =>
              fromLeft(
                ResponseErrorInternal(
                  `Cannot get Service| ${errorsToReadableMessages(errs).join(
                    "/"
                  )}`
                )
              ),
            response =>
              response.status !== 200
                ? fromLeft(
                    ResponseErrorNotFound(
                      "Cannot get service",
                      "Cannot get existing service"
                    )
                  )
                : taskEither.of({ service: response.value, isAdmin })
          )
        )
    );

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
  return getServiceTask(apiClient, authenticatedUser, serviceId)
    .map(_ => ResponseSuccessJson(_.service))
    .fold<
      | IResponseSuccessJson<Service>
      | IResponseErrorForbiddenNotAuthorized
      | IResponseErrorInternal
      | IResponseErrorNotFound
    >(identity, identity)
    .run();
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
  // Get old service data
  return getServiceTask(apiClient, authenticatedUser, serviceId)
    .map(({ service, isAdmin }) => {
      logger.debug(
        "updating service %s",
        JSON.stringify({ ...service, ...servicePayload })
      );
      return !isAdmin
        ? {
            payload: pick(
              [
                "department_name",
                "organization_fiscal_code",
                "organization_name",
                "service_name"
              ],
              servicePayload
            ),
            service
          }
        : { payload: servicePayload, service };
    })
    .foldTaskEither<
      IResponseErrorInternal | IResponseErrorNotFound,
      IResponseSuccessJson<ServicePublic>
    >(fromLeft, ({ payload, service }) =>
      tryCatch(
        () =>
          notificationApiClient.updateService({
            body: { ...service, ...payload },
            service_id: serviceId
          }),
        toError
      )
        .mapLeft(err =>
          ResponseErrorInternal("Error updating service: " + err.message)
        )
        .foldTaskEither<
          IResponseErrorInternal,
          IResponseSuccessJson<ServicePublic>
        >(fromLeft, errorOrUpdateResponse =>
          errorOrUpdateResponse.fold(
            errs =>
              fromLeft(
                ResponseErrorInternal(
                  `Cannot update Service| ${errorsToReadableMessages(errs).join(
                    "/"
                  )}`
                )
              ),
            response =>
              response.status !== 200
                ? fromLeft(ResponseErrorInternal("Cannot update service"))
                : taskEither.of(
                    ResponseSuccessJson(
                      ServicePublic.encode({
                        ...response.value,
                        version: fromNullable(response.value.version).getOrElse(
                          0
                        )
                      })
                    )
                  )
          )
        )
    )
    .fold<
      | IResponseSuccessJson<ServicePublic>
      | IResponseErrorForbiddenNotAuthorized
      | IResponseErrorInternal
      | IResponseErrorNotFound
    >(identity, identity)
    .run();
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
    .chain(user => checkAdminTask(user))
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
