/**
 * Middleware that extracts the Active directory B2C user data
 * from the HTTP request.
 */
import ApiManagementClient from "azure-arm-apimanagement";
import { Either, left, right } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";

import {
  IResponseErrorForbiddenNotAuthorized,
  ResponseErrorForbiddenNotAuthorized
} from "italia-ts-commons/lib/responses";
import { EmailString } from "italia-ts-commons/lib/strings";
import {
  getApimUser,
  IExtendedUserContract,
  isAdminUser
} from "../apim_operations";
import { logger } from "../logger";
import { SessionUser } from "../utils/session";

export async function getActualUser(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  userEmail?: EmailString
): Promise<
  Either<IResponseErrorForbiddenNotAuthorized, IExtendedUserContract>
> {
  // Get API management groups for the authenticated user
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );

  // Check if the authenticated user is an administrator
  const isApimAdmin = maybeApimUser.exists(isAdminUser);

  // If the logged in user is an administrator and we have
  // an email address, load the actual user from that address
  // othwerise return the authenticated user
  const maybeRetrievedApimUser =
    userEmail && isApimAdmin
      ? await getApimUser(apiClient, userEmail)
      : maybeApimUser;

  logger.debug(
    "getActualUser (isApimAdmin=%d maybeApimUser=%s maybeRetrievedApimUser=%s)",
    isApimAdmin,
    maybeApimUser,
    maybeRetrievedApimUser
  );

  if (isNone(maybeRetrievedApimUser)) {
    return left(ResponseErrorForbiddenNotAuthorized);
  }

  return right(maybeRetrievedApimUser.value);
}
