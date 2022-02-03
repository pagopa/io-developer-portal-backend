/**
 *  Shares public configuration variables with the client.
 */
import * as express from "express";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { PublicConfig } from "../../generated/definitions/PublicConfig";
import * as config from "../config";

/**
 * All public data to share with client
 */

const publicConfig: PublicConfig = (() => {
  switch (config.IDP) {
    case "azure-ad":
      return {
        audience: `https://${config.tenantName}.onmicrosoft.com/${config.azureAdCreds.clientID}`,
        authority: `https://${config.tenantName}.b2clogin.com/${config.tenantName}.onmicrosoft.com/${config.policyName}`,
        b2cScopes: [
          `https://${config.tenantName}.onmicrosoft.com/${config.clientName}/user_impersonation`
        ],
        changePasswordLink: `https://${config.tenantName}.b2clogin.com/${config.tenantName}/oauth2/v2.0/authorize?p=${config.resetPasswordPolicyName}&client_id=${config.azureAdCreds.clientID}&nonce=defaultNonce&redirect_uri=${config.azureAdCreds.redirectUrl}&scope=openid&response_type=id_token&prompt=login`,
        clientID: config.azureAdCreds.clientID
      };
    case "selfcare":
      return {
        login_url: config.selfcareSessionCreds.login_url
      };
    default:
      const idp: never = config.IDP;
      throw new Error(`Invalid IDP: ${idp}`);
  }
})();

export async function getConfiguration(
  _: express.Request
): Promise<IResponseSuccessJson<typeof publicConfig>> {
  return ResponseSuccessJson(publicConfig);
}
