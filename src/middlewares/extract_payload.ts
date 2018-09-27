/**
 * Middleware that extract a typed object from the HTTP request payload (json body).
 */
import * as t from "io-ts";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { logger } from "../logger";

export function ExtractFromPayloadMiddleware<S, A>(
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A> {
  return request =>
    new Promise(resolve => {
      const validation = type.decode(request.body);
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(type)
      );
      logger.debug(
        "ExtractFromPayloadMiddleware %s %s => %s",
        type.name,
        JSON.stringify(request.body),
        JSON.stringify(result.value)
      );
      resolve(result);
    });
}
