"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const responses_1 = require("italia-ts-commons/lib/responses");
const config = require("../config");
/**
 * All public data to share with client
 */
const msalConfig = {
    audience: `https://${config.tenantId}/${config.creds.clientID}`,
    authority: `https://login.microsoftonline.com/tfp/${config.tenantId}/${config.policyName}`,
    b2cScopes: [
        `https://${config.tenantId}/${config.clientName}/user_impersonation`
    ],
    changePasswordLink: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?p=${config.resetPasswordPolicyName}&client_id=${config.creds.clientID}&nonce=defaultNonce&redirect_uri=${config.creds.redirectUrl}login&scope=openid&response_type=id_token&prompt=login`,
    clientID: config.creds.clientID
};
function getConfiguration(_) {
    return __awaiter(this, void 0, void 0, function* () {
        return responses_1.ResponseSuccessJson(msalConfig);
    });
}
exports.getConfiguration = getConfiguration;
//# sourceMappingURL=configuration.js.map