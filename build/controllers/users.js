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
const responses_1 = require("italia-ts-commons/lib/responses");
const apim_operations_1 = require("../apim_operations");
const Option_1 = require("fp-ts/lib/Option");
const types_1 = require("italia-ts-commons/lib/types");
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
        if (!apim_operations_1.isAdminUser(apimUser)) {
            return responses_1.ResponseErrorForbiddenNotAuthorized;
        }
        // Authenticates this request against the logged in user
        // checking that serviceId = subscriptionId
        // if the user is an admin we skip the check on userId
        const users = yield apim_operations_1.getApimUsers(apiClient);
        const userCollection = users.map(u => types_1.pick(["email", "firstName", "lastName"], u));
        return responses_1.ResponseSuccessJson({
            items: userCollection,
            length: userCollection.length
        });
    });
}
exports.getUsers = getUsers;
//# sourceMappingURL=users.js.map