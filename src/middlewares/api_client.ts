/**
 * Middleware that get a new Azure API management client
 * authenticated using MSI.
 */
import ApiManagementClient from "azure-arm-apimanagement";
import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ITokenAndCredentials, loginToApim } from "../apim_operations";
import * as config from "../config";

// tslint:disable-next-line
let tokenCreds: ITokenAndCredentials;

export function getApiClientMiddleware(): IRequestMiddleware<
  never,
  ApiManagementClient
> {
  return async _ => {
    tokenCreds =
      config.useServicePrincipal === "1"
        ? await loginToApim(
            tokenCreds,
            config.servicePrincipalClientId,
            config.servicePrincipalSecret,
            config.tenantId
          )
        : await loginToApim(tokenCreds);
    return right(
      new ApiManagementClient(tokenCreds.loginCreds, config.subscriptionId)
    );
  };
}
