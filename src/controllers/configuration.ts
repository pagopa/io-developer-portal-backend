/**
 *  Shares public configuration variables with the client.
 */
import * as express from "express";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import * as config from "../config";

/**
 * All public data to share with client
 */
const msalConfig = {
  audience: `https://${config.tenantName}/${config.creds.clientID}`,
  authority: `https://${config.tenantName}.b2clogin.com/${config.tenantName}/${config.policyName}`,
  b2cScopes: [
    `https://${config.tenantName}/${config.clientName}/user_impersonation`
  ],
  changePasswordLink: `https://${config.tenantName}.b2clogin.com/${config.tenantName}/oauth2/v2.0/authorize?p=${config.resetPasswordPolicyName}&client_id=${config.creds.clientID}&nonce=defaultNonce&redirect_uri=${config.creds.redirectUrl}&scope=openid&response_type=id_token&prompt=login`,
  clientID: config.creds.clientID
};

export async function getConfiguration(
  _: express.Request
): Promise<IResponseSuccessJson<typeof msalConfig> | IResponseErrorInternal> {
  return ResponseSuccessJson(msalConfig);
}
