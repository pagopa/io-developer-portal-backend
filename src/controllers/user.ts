import ApiManagementClient from "azure-arm-apimanagement";
import { UserContract } from "azure-arm-apimanagement/lib/models";
import { isRight } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailString } from "italia-ts-commons/lib/strings";
import { pick } from "italia-ts-commons/lib/types";
import {
  getApimUser,
  getApimUsers,
  IExtendedUserContract,
  isAdminUser
} from "../apim_operations";
import { AdUser } from "../auth-strategies/bearer_strategy";
import { logger } from "../logger";
import { getActualUser } from "../middlewares/actual_user";

interface IUserData {
  readonly apimUser: IExtendedUserContract | undefined;
  readonly authenticatedUser: AdUser;
}

export async function getUser(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  userEmail?: EmailString
): Promise<
  IResponseSuccessJson<IUserData> | IResponseErrorForbiddenNotAuthorized
> {
  logger.debug("getUser (%s)", userEmail);
  const errorOrRetrievedApimUser = await getActualUser(
    apiClient,
    authenticatedUser,
    userEmail
  );
  return ResponseSuccessJson({
    apimUser: isRight(errorOrRetrievedApimUser)
      ? errorOrRetrievedApimUser.value
      : undefined,
    authenticatedUser
  });
}

type ApimUser = Pick<UserContract, "email" | "firstName" | "lastName">;

/**
 * List all users, only for admins
 */
export async function getUsers(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser
): Promise<
  | IResponseSuccessJson<{
      readonly items: ReadonlyArray<ApimUser>;
      readonly length: number;
    }>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );
  if (isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const apimUser = maybeApimUser.value;

  // This endpoint is only for admins
  if (!isAdminUser(apimUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  const users = await getApimUsers(apiClient);
  const userCollection = users.map(u =>
    pick(["email", "firstName", "lastName"], u)
  );
  return ResponseSuccessJson({
    items: userCollection,
    length: userCollection.length
  });
}
