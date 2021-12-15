/**
 * Middleware that extracts the Active directory B2C user data
 * from the HTTP request.
 */
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { SelfCareIdentity } from "../auth-strategies/selfcare_identity_strategy";
import { logger } from "../logger";

export function getSelfCareIdentityFromRequestMiddleware(): IRequestMiddleware<
  "IResponseErrorValidation",
  SelfCareIdentity
> {
  return request =>
    new Promise(resolve => {
      const validation = SelfCareIdentity.decode(request.user);
      logger.debug(
        "Trying to get resolved identity: %s",
        JSON.stringify(request.user)
      );
      const result = validation.mapLeft(
        ResponseErrorFromValidationErrors(SelfCareIdentity)
      );
      resolve(result);
    });
}
