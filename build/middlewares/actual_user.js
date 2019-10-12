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
const Either_1 = require("fp-ts/lib/Either");
const Option_1 = require("fp-ts/lib/Option");
const responses_1 = require("italia-ts-commons/lib/responses");
const apim_operations_1 = require("../apim_operations");
const logger_1 = require("../logger");
function getActualUser(apiClient, authenticatedUser, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get API management groups for the authenticated user
        const maybeApimUser = yield apim_operations_1.getApimUser(apiClient, authenticatedUser.emails[0]);
        // Check if the authenticated user is an administrator
        const isApimAdmin = maybeApimUser.exists(apim_operations_1.isAdminUser);
        // If the logged in user is an administrator and we have
        // an email address, load the actual user from that address
        // othwerise return the authenticated user
        const maybeRetrievedApimUser = userEmail && isApimAdmin
            ? yield apim_operations_1.getApimUser(apiClient, userEmail)
            : maybeApimUser;
        logger_1.logger.debug("getActualUser (isApimAdmin=%d maybeApimUser=%s maybeRetrievedApimUser=%s)", isApimAdmin, maybeApimUser, maybeRetrievedApimUser);
        if (Option_1.isNone(maybeRetrievedApimUser)) {
            return Either_1.left(responses_1.ResponseErrorForbiddenNotAuthorized);
        }
        return Either_1.right(maybeRetrievedApimUser.value);
    });
}
exports.getActualUser = getActualUser;
//# sourceMappingURL=actual_user.js.map