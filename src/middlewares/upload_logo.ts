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

import { ErrorResponses, notificationApiClient } from "../controllers/services";

import { toError } from "fp-ts/lib/Either";
import { ServiceId } from "../../generated/api/ServiceId";

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
        logo: serviceLogo,
        serviceId
      }),
    errors => ResponseErrorInternal(toError(errors).message)
  ).foldTaskEither(
    error => fromLeft(error),
    errorOrResponse =>
      errorOrResponse && errorOrResponse.status === 201
        ? taskEither.of(
            ResponseSuccessRedirectToResource(
              {},
              `${config.logoUrl}/services/${serviceId}.png`,
              {}
            )
          )
        : fromLeft(ResponseErrorInternal(toError(errorOrResponse).message))
  );

export const uploadOrganizationLogoTask = (
  organizationfiscalcode: OrganizationFiscalCode,
  serviceLogo: ApiLogo
): TaskEither<ErrorResponses, IResponseSuccessRedirectToResource<{}, {}>> =>
  tryCatch(
    () =>
      notificationApiClient.uploadOrganizationLogo({
        logo: serviceLogo,
        organizationfiscalcode
      }),
    errors => ResponseErrorInternal(toError(errors).message)
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse && errorOrResponse.status === 201
        ? taskEither.of(
            ResponseSuccessRedirectToResource(
              {},
              `${config.logoUrl}/services/${organizationfiscalcode}.png`,
              {}
            )
          )
        : fromLeft(ResponseErrorInternal(toError(errorOrResponse).message))
  );
