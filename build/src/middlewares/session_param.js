"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Middleware that extracts a typed required parameter from the HTTP request.
 */
const Either_1 = require("fp-ts/lib/Either");
const responses_1 = require("italia-ts-commons/lib/responses");
function OptionalSessionParamMiddleware(name, type) {
    return request => new Promise(resolve => {
        if (!request.session || !request.session[name]) {
            return resolve(Either_1.right(undefined));
        }
        const validation = type.decode(request.session[name]);
        if (Either_1.isLeft(validation)) {
            return resolve(Either_1.left(responses_1.ResponseErrorFromValidationErrors(type)(validation.value)));
        }
        return resolve(Either_1.right(validation.value));
    });
}
exports.OptionalSessionParamMiddleware = OptionalSessionParamMiddleware;
//# sourceMappingURL=session_param.js.map