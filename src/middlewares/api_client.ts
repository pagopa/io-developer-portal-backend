/**
 * Middleware that get a new Azure API management client
 * authenticated using MSI.
 */
import ApiManagementClient from "azure-arm-apimanagement";
import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ITokenAndCredentials, loginToApim } from "../apim_operations";
import * as config from "../config";

// Global var needed to cache the
// API management access token between calls
// tslint:disable-next-line:no-let
let tokenCreds: ITokenAndCredentials;

export function getApiClientMiddleware(): IRequestMiddleware<
  never,
  ApiManagementClient
> {
  return async _ => {
    tokenCreds =
      // note that only a literal "1" will activate
      // the login procedure using the configured service principal;
      // env values like "true" won't work here
      config.useServicePrincipal === "1" &&
      config.servicePrincipalClientId &&
      config.servicePrincipalSecret &&
      config.tenantId
        ? await loginToApim(tokenCreds, {
            servicePrincipalClientId: config.servicePrincipalClientId,
            servicePrincipalSecret: config.servicePrincipalSecret,
            tenantId: config.tenantId
          })
        : await loginToApim(tokenCreds);
    return right(
      new ApiManagementClient(tokenCreds.loginCreds, config.subscriptionId)
    );
  };
}
