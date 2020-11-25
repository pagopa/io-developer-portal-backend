/**
 * Middleware that get tasks performed to upload a logo
 */
import ApiManagementClient from "azure-arm-apimanagement";
import {
  IResponseSuccessRedirectToResource,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";
import {
  getApimUser,
  IExtendedUserContract,
  isAdminUser
} from "../apim_operations";
import { AdUser } from "../bearer_strategy";
import * as config from "../config";

import { Logo as ApiLogo } from "../../generated/api/Logo";

import {
  fromLeft,
  fromPredicate,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { ErrorResponses } from "../controllers/services";

import { toError } from "fp-ts/lib/Either";
import { ServiceId } from "../../generated/api/ServiceId";
import { notificationApiClient } from "../api_client";

export const getApimUserTask = (
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser
): TaskEither<ErrorResponses, IExtendedUserContract> =>
  tryCatch(
    () => getApimUser(apiClient, authenticatedUser.emails[0]),
    errors => ResponseErrorInternal(toError(errors).message)
  ).foldTaskEither<ErrorResponses, IExtendedUserContract>(
    error => fromLeft(error),
    maybeResponse =>
      maybeResponse.foldL(
        () =>
          fromLeft(
            ResponseErrorNotFound(
              "API user not found",
              "Cannot find a user in the API management with the provided email address"
            )
          ),
        response => taskEither.of(response)
      )
  );

export const checkAdminTask = (
  userAdmin: IExtendedUserContract
): TaskEither<ErrorResponses, IExtendedUserContract> =>
  fromPredicate(
    (user: IExtendedUserContract) => isAdminUser(user),
    _ => ResponseErrorForbiddenNotAuthorized
  )(userAdmin);

export const uploadServiceLogoTask = (
  serviceId: ServiceId,
  serviceLogo: ApiLogo
): TaskEither<ErrorResponses, IResponseSuccessRedirectToResource<{}, {}>> =>
  tryCatch(
    () =>
      notificationApiClient.uploadServiceLogo({
        body: serviceLogo,
        service_id: serviceId
      }),
    errors => ResponseErrorInternal(toError(errors).message)
  ).foldTaskEither<ErrorResponses, IResponseSuccessRedirectToResource<{}, {}>>(
    fromLeft,
    _ =>
      _.fold(
        errs => fromLeft(ResponseErrorInternal(toError(errs).message)),
        response =>
          response.status === 201
            ? taskEither.of(
                ResponseSuccessRedirectToResource(
                  {},
                  `${config.logoUrl}/services/${serviceId}.png`,
                  {}
                )
              )
            : fromLeft(ResponseErrorInternal(toError(response).message))
      )
  );

export const uploadOrganizationLogoTask = (
  organizationfiscalcode: OrganizationFiscalCode,
  serviceLogo: ApiLogo
): TaskEither<ErrorResponses, IResponseSuccessRedirectToResource<{}, {}>> =>
  tryCatch(
    () =>
      notificationApiClient.uploadOrganizationLogo({
        body: serviceLogo,
        organization_fiscal_code: organizationfiscalcode
      }),
    errors => ResponseErrorInternal(toError(errors).message)
  ).foldTaskEither<ErrorResponses, IResponseSuccessRedirectToResource<{}, {}>>(
    fromLeft,
    _ =>
      _.fold(
        errs => fromLeft(ResponseErrorInternal(toError(errs).message)),
        response =>
          response.status === 201
            ? taskEither.of(
                ResponseSuccessRedirectToResource(
                  {},
                  `${config.logoUrl}/organizations/${organizationfiscalcode}.png`,
                  {}
                )
              )
            : fromLeft(ResponseErrorInternal(toError(response).message))
      )
  );
