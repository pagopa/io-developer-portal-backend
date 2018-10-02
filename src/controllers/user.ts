import ApiManagementClient from "azure-arm-apimanagement";
import { isLeft } from "fp-ts/lib/Either";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailString } from "italia-ts-commons/lib/strings";
import { IExtendedUserContract } from "../apim_operations";
import { AdUser } from "../bearer_strategy";
import { getActualUser } from "../middlewares/actual_user";

interface IUserData {
  readonly apimUser: IExtendedUserContract;
  readonly authenticatedUser: AdUser;
}

export async function getUser(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  userEmail?: EmailString
): Promise<
  IResponseSuccessJson<IUserData> | IResponseErrorForbiddenNotAuthorized
> {
  const errorOrRetrievedApimUser = await getActualUser(
    apiClient,
    authenticatedUser,
    userEmail
  );
  if (isLeft(errorOrRetrievedApimUser)) {
    return errorOrRetrievedApimUser.value;
  }
  const retrievedApimUser = errorOrRetrievedApimUser.value;

  return ResponseSuccessJson({
    apimUser: retrievedApimUser,
    authenticatedUser
  });
}
