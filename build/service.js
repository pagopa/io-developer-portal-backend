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
 * Creates a new Service tied to the user subscription
 * in the API management resource.
 */
const request = require("request");
const winston = require("winston");
const config = require("./config");
/**
 * RESTful call to Digital Citizenship API
 *  that creates a new Service for the current logged-in user.
 */
exports.upsertService = (apiKey, service) => {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const oldService = yield exports.getService(apiKey, service.service_id);
        winston.debug("upsertService|getService", JSON.stringify(oldService));
        const options = {
            headers: {
                "Ocp-Apim-Subscription-Key": apiKey
            },
            json: service,
            method: oldService ? "PUT" : "POST",
            uri: `${config.adminApiUrl}/adm/services${oldService ? "/" + service.service_id : ""}`
        };
        request(options, (err, res, body) => {
            if (err) {
                winston.error("createService|error|" + JSON.stringify(err));
                return reject(err);
            }
            else if (res.statusCode !== 200) {
                winston.debug("createService|error|", JSON.stringify(body));
                return reject(new Error(body));
            }
            else {
                winston.debug("createService|success|", body);
                return resolve({ res, body });
            }
        });
    }));
};
exports.getService = (apiKey, serviceId
// tslint:disable-next-line:no-any
) => {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                "Ocp-Apim-Subscription-Key": apiKey
            },
            json: true,
            method: "GET",
            uri: `${config.adminApiUrl}/adm/services/${serviceId}`
        };
        winston.debug("getService|serviceId|" + serviceId);
        request(options, (err, res, body) => {
            winston.debug("getService|response|" + JSON.stringify(err) + JSON.stringify(body));
            if (err) {
                winston.error("getService|error|" + JSON.stringify(err));
                return reject(err);
            }
            else if (res.statusCode === 404) {
                winston.debug("getService|not found");
                return resolve(undefined);
            }
            else if (res.statusCode !== 200) {
                winston.debug("getService|error|" + JSON.stringify(body));
                return reject(new Error(body));
            }
            else {
                winston.debug("getService|success|" + JSON.stringify(body));
                return resolve(body);
            }
        });
    });
};
//# sourceMappingURL=service.js.map