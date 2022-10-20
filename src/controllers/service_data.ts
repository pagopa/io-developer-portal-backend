import ApiManagementClient from "azure-arm-apimanagement";
import { fromPredicate, isRight, toError } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
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
import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";

import {
  getApimUser,
  IExtendedUserContract,
  isAdminUser
} from "../apim_operations";
import * as config from "../config";
import { getApimAccountEmail, SessionUser } from "../utils/session";

import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import nodeFetch from "node-fetch";

export const serviceDataTask = (
  organizationFiscalCode: OrganizationFiscalCode,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): TaskEither<IResponseErrorInternal, IResponseSuccessJson<boolean>> => {
  return tryCatch<IResponseErrorInternal, Response>(
    () => {
      const url = `${config.SERVICE_DATA_URL}/organizations/${organizationFiscalCode}/services}`;
      const body = JSON.stringify("");
      const headers = {
        "X-Functions-Key": config.SERVICE_DATA_APIKEY
      };
      const fetch = fetchApi(`${url}`, {
        body,
        headers,
        method: "*"
      });
      return fetch;
    },
    errors => ResponseErrorInternal(toError(errors).message)
  ).map(_ => ResponseSuccessJson<boolean>(true));
};

export async function serviceData(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  organizationFiscalCode: OrganizationFiscalCode
): Promise<
  | IResponseSuccessJson<boolean>
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );
  if (isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const authenticatedApimUser = maybeApimUser.value;

  const res = fromPredicate(
    (user: IExtendedUserContract) => isAdminUser(user),
    _ => ResponseErrorForbiddenNotAuthorized
  )(authenticatedApimUser);
  if (isRight(res)) {
    const proxy = await serviceDataTask(organizationFiscalCode).run();
    if (isRight(proxy)) {
      return ResponseSuccessJson(proxy.value.value);
    } else {
      return ResponseErrorInternal("Internal Error");
    }
  } else {
    return ResponseErrorForbiddenNotAuthorized;
  }
}
