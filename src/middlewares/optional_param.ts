/**
 * Middleware that extracts a typed required parameter from the HTTP request.
 */
import * as t from "io-ts";

import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorValidation,
  ResponseErrorFromValidationErrors
} from "italia-ts-commons/lib/responses";

export function OptionalParamMiddleware<S, A>(
  name: string,
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A | undefined> {
  return async request => {
    if (request.params[name] === undefined) {
      return right(undefined);
    }
    return type
      .decode(request.params[name])
      .mapLeft<IResponseErrorValidation>(
        ResponseErrorFromValidationErrors(type)
      );
  };
}
