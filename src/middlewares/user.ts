/**
 * Middleware that extracts the Active directory B2C user data
 * from the HTTP request.
 */
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { AdUser } from "../auth-strategies/azure_ad_strategy";
import { logger } from "../logger";

export function getUserFromRequestMiddleware(): IRequestMiddleware<
  "IResponseErrorValidation",
  AdUser
> {
  return request =>
    new Promise(resolve => {
      const validation = AdUser.decode(request.user);
      logger.debug(
        "Trying to get authenticated user: %s",
        JSON.stringify(request.user)
      );
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(AdUser)
      );
      resolve(result);
    });
}
