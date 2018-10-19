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
const types_1 = require("italia-ts-commons/lib/types");
const apim_operations_1 = require("../apim_operations");
const logger_1 = require("../logger");
const actual_user_1 = require("../middlewares/actual_user");
function getUser(apiClient, authenticatedUser, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getUser (%s)", userEmail);
        const errorOrRetrievedApimUser = yield actual_user_1.getActualUser(apiClient, authenticatedUser, userEmail);
        return responses_1.ResponseSuccessJson({
            apimUser: Either_1.isRight(errorOrRetrievedApimUser)
                ? errorOrRetrievedApimUser.value
                : undefined,
            authenticatedUser
        });
    });
}
exports.getUser = getUser;
/**
 * List all users, only for admins
 */
function getUsers(apiClient, authenticatedUser) {
    return __awaiter(this, void 0, void 0, function* () {
        const maybeApimUser = yield apim_operations_1.getApimUser(apiClient, authenticatedUser.emails[0]);
        if (Option_1.isNone(maybeApimUser)) {
            return responses_1.ResponseErrorNotFound("API user not found", "Cannot find a user in the API management with the provided email address");
        }
        const apimUser = maybeApimUser.value;
        // This endpoint is only for admins
        if (!apim_operations_1.isAdminUser(apimUser)) {
            return responses_1.ResponseErrorForbiddenNotAuthorized;
        }
        const users = yield apim_operations_1.getApimUsers(apiClient);
        const userCollection = users.map(u => types_1.pick(["email", "firstName", "lastName"], u));
        return responses_1.ResponseSuccessJson({
            items: userCollection,
            length: userCollection.length
        });
    });
}
exports.getUsers = getUsers;
//# sourceMappingURL=user.js.map