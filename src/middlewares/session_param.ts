/**
 * Middleware that extracts a typed required parameter from the HTTP request.
 */
import { isLeft, left, right } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorValidation,
  ResponseErrorFromValidationErrors
} from "italia-ts-commons/lib/responses";

export function OptionalSessionParamMiddleware<S, A>(
  name: string,
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A | undefined> {
  return request =>
    new Promise(resolve => {
      if (!request.session || !request.session[name]) {
        return resolve(
          right<IResponseErrorValidation, A | undefined>(undefined)
        );
      }
      const validation = type.decode(request.session[name]);
      if (isLeft(validation)) {
        return resolve(
          left<IResponseErrorValidation, A | undefined>(
            ResponseErrorFromValidationErrors(type)(validation.value)
          )
        );
      }
      return resolve(
        right<IResponseErrorValidation, A | undefined>(validation.value)
      );
    });
}
