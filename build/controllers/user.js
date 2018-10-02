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
const Option_1 = require("fp-ts/lib/Option");
const responses_1 = require("italia-ts-commons/lib/responses");
const apim_operations_1 = require("../apim_operations");
function getUser(apiClient, authenticatedUser, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        const maybeApimUser = yield apim_operations_1.getApimUser(apiClient, authenticatedUser.emails[0]);
        const isApimAdmin = maybeApimUser.exists(apim_operations_1.isAdminUser);
        // If the logged in user is an administrator and we have
        // an email address, load the actual user from that address
        const maybeRetrievedApimUser = userEmail && isApimAdmin
            ? yield apim_operations_1.getApimUser(apiClient, userEmail)
            : maybeApimUser;
        if (Option_1.isNone(maybeRetrievedApimUser)) {
            return responses_1.ResponseErrorNotFound("API user not found", "Cannot find a user in the API management with the provided email address");
        }
        const apimUser = maybeRetrievedApimUser.value;
        return responses_1.ResponseSuccessJson({ authenticatedUser, apimUser });
    });
}
exports.getUser = getUser;
//# sourceMappingURL=user.js.map