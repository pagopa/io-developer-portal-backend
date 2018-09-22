import * as t from "io-ts";

import ApiManagementClient from "azure-arm-apimanagement";
import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { newApiClient } from "./apim_operations";
import { AdUser } from "./bearer_strategy";

export function getUserFromRequestMiddleware(): IRequestMiddleware<
  "IResponseErrorValidation",
  AdUser
> {
  return request =>
    new Promise(resolve => {
      const validation = AdUser.decode(request.user);
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(AdUser)
      );
      resolve(result);
    });
}

// TODO: this must be cached until the token expire
// actually we get a new token for every request !
export function getApiClientMiddleware(): IRequestMiddleware<
  never,
  ApiManagementClient
> {
  return async _ => right(await newApiClient());
}

export function RequiredParamMiddleware<S, A>(
  name: string,
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A> {
  return request =>
    new Promise(resolve => {
      const validation = type.decode(request.params[name]);
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(type)
      );
      resolve(result);
    });
}

export function ExtractFromPayloadMiddleware<S, A>(
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A> {
  return request =>
    new Promise(resolve => {
      const validation = type.decode(request.body);
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(type)
      );
      resolve(result);
    });
}
