"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const responses_1 = require("italia-ts-commons/lib/responses");
const bearer_strategy_1 = require("../bearer_strategy");
const logger_1 = require("../logger");
function getUserFromRequestMiddleware() {
    return request => new Promise(resolve => {
        const validation = bearer_strategy_1.AdUser.decode(request.user);
        logger_1.logger.debug("Trying to get authenticated user: %s", JSON.stringify(request.user));
        const result = validation.mapLeft(responses_1.ResponseErrorFromValidationErrors(bearer_strategy_1.AdUser));
        resolve(result);
    });
}
exports.getUserFromRequestMiddleware = getUserFromRequestMiddleware;
//# sourceMappingURL=user.js.map