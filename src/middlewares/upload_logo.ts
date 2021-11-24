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
  getUserSubscription,
  IExtendedUserContract,
  isAdminUser
} from "../apim_operations";
import { AdUser } from "../auth-strategies/bearer_strategy";
import * as config from "../config";

import { Logo as ApiLogo } from "../../generated/api/Logo";

import {
  fromEither,
  fromLeft,
  fromPredicate,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { Option } from "fp-ts/lib/Option";

import { ErrorResponses, notificationApiClient } from "../controllers/services";

import { SubscriptionContract } from "azure-arm-apimanagement/lib/models";
import { fromNullable, toError } from "fp-ts/lib/Either";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
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
  )
    .chain(uploadRespose =>
      fromEither(fromNullable(ResponseErrorInternal("Error"))(uploadRespose))
    )
    .foldTaskEither(
      error => fromLeft(error),
      errorOrResponse =>
        errorOrResponse.status === 201
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
  )
    .chain(uploadRespose =>
      fromEither(fromNullable(ResponseErrorInternal("Error"))(uploadRespose))
    )
    .foldTaskEither(
      err => fromLeft(err),
      errorOrResponse =>
        errorOrResponse.status === 201
          ? taskEither.of(
              ResponseSuccessRedirectToResource(
                {},
                `${config.logoUrl}/organizations/${organizationfiscalcode}.png`,
                {}
              )
            )
          : fromLeft(ResponseErrorInternal(toError(errorOrResponse).message))
    );

export const getUserSubscriptionTask = (
  apiClient: ApiManagementClient,
  serviceId: NonEmptyString,
  authenticatedApimUser: IExtendedUserContract
): TaskEither<
  ErrorResponses,
  SubscriptionContract & { readonly name: string }
> => {
  return tryCatch<
    ErrorResponses,
    Option<SubscriptionContract & { readonly name: string }>
  >(
    () =>
      getUserSubscription(
        apiClient,
        serviceId,
        isAdminUser(authenticatedApimUser)
          ? undefined
          : authenticatedApimUser.id
      ),
    errors => ResponseErrorInternal(toError(errors).message)
  ).chain<SubscriptionContract & { readonly name: string }>(maybeResponse =>
    maybeResponse.foldL<
      TaskEither<
        ErrorResponses,
        SubscriptionContract & { readonly name: string }
      >
    >(
      () => fromLeft(ResponseErrorForbiddenNotAuthorized),
      _ => taskEither.of(_)
    )
  );
};
