"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request");
const config = require("./config");
const logger_1 = require("./logger");
/**
 * RESTful call to Digital Citizenship API
 * that send a new message to new user (fake profile).
 */
exports.sendMessage = (apiKey, fakeFiscalCode, message) => {
    logger_1.logger.debug("sendMessage|message|", message);
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                "Ocp-Apim-Subscription-Key": apiKey
            },
            json: message,
            method: "POST",
            uri: `${config.adminApiUrl}/api/v1/messages/${fakeFiscalCode}`
        };
        request(options, (err, res, body) => {
            if (err) {
                logger_1.logger.error("sendMessage|error|" + JSON.stringify(err));
                return reject(err);
            }
            if (res.statusCode !== 201) {
                logger_1.logger.debug("sendMessage|error|", JSON.stringify(body));
                return reject(new Error(body));
            }
            logger_1.logger.debug("sendMessage|success|", body);
            resolve({ res, body });
        });
    });
};
//# sourceMappingURL=message.js.map