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
const responses_1 = require("italia-ts-commons/lib/responses");
const logger_1 = require("../logger");
const actual_user_1 = require("../middlewares/actual_user");
function getUser(apiClient, authenticatedUser, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getUser (%s)", userEmail);
        const errorOrRetrievedApimUser = yield actual_user_1.getActualUser(apiClient, authenticatedUser, userEmail);
        if (Either_1.isLeft(errorOrRetrievedApimUser)) {
            return errorOrRetrievedApimUser.value;
        }
        const retrievedApimUser = errorOrRetrievedApimUser.value;
        return responses_1.ResponseSuccessJson({
            apimUser: retrievedApimUser,
            authenticatedUser
        });
    });
}
exports.getUser = getUser;
//# sourceMappingURL=user.js.map