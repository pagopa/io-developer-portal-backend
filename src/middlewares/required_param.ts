/**
 * Middleware that extracts a typed required parameter from the HTTP request.
 */
import * as t from "io-ts";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

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
