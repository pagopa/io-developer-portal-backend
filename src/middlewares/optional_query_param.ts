/**
 * Middleware that extracts a typed optional query parameter from the HTTP request.
 */
import * as t from "io-ts";

import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorValidation,
  ResponseErrorFromValidationErrors
} from "italia-ts-commons/lib/responses";

export function OptionalQueryParamMiddleware<S, A>(
  name: string,
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A | undefined> {
  return async request => {
    if (request.query[name] === undefined) {
      return right(undefined);
    }
    return type
      .decode(request.query[name])
      .mapLeft<IResponseErrorValidation>(
        ResponseErrorFromValidationErrors(type)
      );
  };
}
