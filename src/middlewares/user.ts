/**
 * Middleware that extracts the Active directory B2C user data
 * from the HTTP request.
 */
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { logger } from "../logger";
import { SessionUser } from "../utils/session";

export function getUserFromRequestMiddleware(): IRequestMiddleware<
  "IResponseErrorValidation",
  SessionUser
> {
  return request =>
    new Promise(resolve => {
      const validation = SessionUser.decode(request.user);
      logger.debug(
        "Trying to get authenticated user: %s",
        JSON.stringify(request.user)
      );
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(SessionUser)
      );
      resolve(result);
    });
}
