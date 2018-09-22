"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const responses_1 = require("italia-ts-commons/lib/responses");
function ExtractFromPayloadMiddleware(type) {
    return request => new Promise(resolve => {
        const validation = type.decode(request.body);
        const result = validation.mapLeft(responses_1.ResponseErrorFromValidationErrors(type));
        resolve(result);
    });
}
exports.ExtractFromPayloadMiddleware = ExtractFromPayloadMiddleware;
//# sourceMappingURL=extract_payload.js.map