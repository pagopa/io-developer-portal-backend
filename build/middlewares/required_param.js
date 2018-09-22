"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const responses_1 = require("italia-ts-commons/lib/responses");
function RequiredParamMiddleware(name, type) {
    return request => new Promise(resolve => {
        const validation = type.decode(request.params[name]);
        const result = validation.mapLeft(responses_1.ResponseErrorFromValidationErrors(type));
        resolve(result);
    });
}
exports.RequiredParamMiddleware = RequiredParamMiddleware;
//# sourceMappingURL=required_param.js.map