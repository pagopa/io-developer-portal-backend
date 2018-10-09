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
const new_subscription_1 = require("../new_subscription");
const Either_1 = require("fp-ts/lib/Either");
const actual_user_1 = require("../middlewares/actual_user");
/**
 * List all subscriptions for the logged in user
 */
function getSubscriptions(apiClient, authenticatedUser, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        const errorOrRetrievedApimUser = yield actual_user_1.getActualUser(apiClient, authenticatedUser, userEmail);
        if (Either_1.isLeft(errorOrRetrievedApimUser)) {
            return errorOrRetrievedApimUser.value;
        }
        const retrievedApimUser = errorOrRetrievedApimUser.value;
        const subscriptions = yield apim_operations_1.getUserSubscriptions(apiClient, retrievedApimUser.name);
        return responses_1.ResponseSuccessJson(subscriptions);
    });
}
exports.getSubscriptions = getSubscriptions;
/**
 * Subscribe the user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
function postSubscriptions(apiClient, authenticatedUser, subscriptionData, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        const errorOrRetrievedApimUser = yield actual_user_1.getActualUser(apiClient, authenticatedUser, userEmail);
        if (Either_1.isLeft(errorOrRetrievedApimUser)) {
            return errorOrRetrievedApimUser.value;
        }
        const retrievedApimUser = errorOrRetrievedApimUser.value;
        const subscriptionOrError = yield new_subscription_1.subscribeApimUser(apiClient, retrievedApimUser, subscriptionData);
        return subscriptionOrError.fold(err => responses_1.ResponseErrorInternal("Cannot add new subscription: " + err), responses_1.ResponseSuccessJson);
    });
}
exports.postSubscriptions = postSubscriptions;
/**
 * Regenerate keys for an existing subscription
 * belonging to the logged in user.
 */
function putSubscriptionKey(apiClient, authenticatedUser, subscriptionId, keyType) {
    return __awaiter(this, void 0, void 0, function* () {
        const maybeUser = yield apim_operations_1.getApimUser(apiClient, authenticatedUser.emails[0]);
        if (Option_1.isNone(maybeUser)) {
            return responses_1.ResponseErrorForbiddenNotAuthorized;
        }
        const user = maybeUser.value;
        const maybeSubscription = yield apim_operations_1.getUserSubscription(apiClient, subscriptionId, user.id);
        if (Option_1.isNone(maybeSubscription)) {
            return responses_1.ResponseErrorNotFound("Subscription not found", "Cannot find a subscription for the logged in user");
        }
        const subscription = maybeSubscription.value;
        const maybeUpdatedSubscription = keyType === "secondary_key"
            ? yield apim_operations_1.regenerateSecondaryKey(apiClient, subscription.name, user.id)
            : keyType === "primary_key"
                ? yield apim_operations_1.regeneratePrimaryKey(apiClient, subscription.name, user.id)
                : Option_1.none;
        return maybeUpdatedSubscription.fold(responses_1.ResponseErrorInternal("Cannot update subscription to renew key"), responses_1.ResponseSuccessJson);
    });
}
exports.putSubscriptionKey = putSubscriptionKey;
//# sourceMappingURL=subscriptions.js.map