/**
 * Middleware that get a new Azure API management client
 * authenticated using MSI.
 */
import ApiManagementClient from "azure-arm-apimanagement";
import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { newApiClient } from "../apim_operations";

// TODO: this must be cached until the token expire
// actually we get a new token for every request !
export function getApiClientMiddleware(): IRequestMiddleware<
  never,
  ApiManagementClient
> {
  return async _ => right(await newApiClient());
}
