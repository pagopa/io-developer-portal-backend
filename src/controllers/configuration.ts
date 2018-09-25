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
  audience: `https://${config.tenantId}/${config.creds.clientID}`,
  authority: `https://login.microsoftonline.com/tfp/${config.tenantId}/${
    config.policyName
  }`,
  b2cScopes: [
    `https://${config.tenantId}/${config.clientName}/user_impersonation`
  ],
  changePasswordLink: `https://login.microsoftonline.com/${
    config.tenantId
  }/oauth2/v2.0/authorize?p=${config.resetPasswordPolicyName}&client_id=${
    config.creds.clientID
  }&nonce=defaultNonce&redirect_uri=${
    config.creds.redirectUrl
  }&scope=openid&response_type=id_token&prompt=login`,
  clientID: config.creds.clientID
};

export async function getConfiguration(
  _: express.Request
): Promise<IResponseSuccessJson<typeof msalConfig> | IResponseErrorInternal> {
  return ResponseSuccessJson(msalConfig);
}
