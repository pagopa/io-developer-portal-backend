"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const responses_1 = require("italia-ts-commons/lib/responses");
const logger_1 = require("../logger");
function ExtractFromPayloadMiddleware(type) {
    return request => new Promise(resolve => {
        const validation = type.decode(request.body);
        const result = validation.mapLeft(responses_1.ResponseErrorFromValidationErrors(type));
        logger_1.logger.debug("ExtractFromPayloadMiddleware %s %s => %s", type.name, JSON.stringify(request), JSON.stringify(result.value));
        resolve(result);
    });
}
exports.ExtractFromPayloadMiddleware = ExtractFromPayloadMiddleware;
//# sourceMappingURL=extract_payload.js.map