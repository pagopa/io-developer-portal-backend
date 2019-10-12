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
/**
 * Middleware that get a new Azure API management client
 * authenticated using MSI.
 */
const azure_arm_apimanagement_1 = require("azure-arm-apimanagement");
const Either_1 = require("fp-ts/lib/Either");
const apim_operations_1 = require("../apim_operations");
const config = require("../config");
// Global var needed to cache the
// API management access token between calls
// tslint:disable-next-line:no-let
let tokenCreds;
function getApiClientMiddleware() {
    return (_) => __awaiter(this, void 0, void 0, function* () {
        tokenCreds =
            // note that only a literal "1" will activate
            // the login procedure using the configured service principal;
            // env values like "true" won't work here
            config.useServicePrincipal === "1" &&
                config.servicePrincipalClientId &&
                config.servicePrincipalSecret &&
                config.tenantId
                ? yield apim_operations_1.loginToApim(tokenCreds, {
                    servicePrincipalClientId: config.servicePrincipalClientId,
                    servicePrincipalSecret: config.servicePrincipalSecret,
                    tenantId: config.tenantId
                })
                : yield apim_operations_1.loginToApim(tokenCreds);
        return Either_1.right(new azure_arm_apimanagement_1.default(tokenCreds.loginCreds, config.subscriptionId));
    });
}
exports.getApiClientMiddleware = getApiClientMiddleware;
//# sourceMappingURL=api_client.js.map