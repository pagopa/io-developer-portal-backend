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
const msRestAzure = require("ms-rest-azure");
const logger_1 = require("./logger");
const config = require("./config");
const Either_1 = require("fp-ts/lib/Either");
const Option_1 = require("fp-ts/lib/Option");
const ulid_1 = require("ulid");
function getToken(loginCreds) {
    return new Promise((resolve, reject) => {
        loginCreds.getToken((err, tok) => {
            if (err) {
                logger_1.logger.debug("getToken() error: %s", err.message);
                return reject(err);
            }
            resolve(tok);
        });
    });
}
function loginToApim(tokenCreds) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenExpireTime = tokenCreds
            ? new Date(tokenCreds.token.expiresOn).getTime()
            : 0;
        const isTokenExpired = tokenExpireTime >= Date.now();
        logger_1.logger.debug("token %s", JSON.stringify(tokenCreds ? tokenCreds.token : "n/a"));
        logger_1.logger.debug("loginToApim() token expire: %s (%d) now:%d expired=%s", tokenCreds ? tokenCreds.token.expiresOn : "n/a", tokenExpireTime, Date.now(), isTokenExpired);
        // return old credentials in case the token is not expired
        if (tokenCreds && !isTokenExpired) {
            return tokenCreds;
        }
        logger_1.logger.debug("loginToApim(): login with MSI");
        const loginCreds = yield msRestAzure.loginWithAppServiceMSI();
        const token = yield getToken(loginCreds);
        logger_1.logger.debug("loginToApim(): token:%s", JSON.stringify(token));
        return {
            loginCreds,
            token
        };
    });
}
exports.loginToApim = loginToApim;
function getUserSubscription(apiClient, subscriptionId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getUserSubscription");
        const subscription = yield apiClient.subscription.get(config.azurermResourceGroup, config.azurermApim, subscriptionId);
        if (subscription.userId !== userId || !subscription.name) {
            return Option_1.none;
        }
        return Option_1.some(Object.assign({ name: subscription.name }, subscription));
    });
}
exports.getUserSubscription = getUserSubscription;
function getUserSubscriptions(apiClient, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getUserSubscriptions");
        // TODO: this list is paginated with a next-link
        // by now we get only the first result page
        return apiClient.userSubscription.list(config.azurermResourceGroup, config.azurermApim, userId);
    });
}
exports.getUserSubscriptions = getUserSubscriptions;
function regeneratePrimaryKey(apiClient, subscriptionId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("regeneratePrimaryKey");
        const maybeSubscription = yield getUserSubscription(apiClient, subscriptionId, userId);
        if (Option_1.isNone(maybeSubscription)) {
            return Option_1.none;
        }
        yield apiClient.subscription.regeneratePrimaryKey(config.azurermResourceGroup, config.azurermApim, subscriptionId);
        return getUserSubscription(apiClient, subscriptionId, userId);
    });
}
exports.regeneratePrimaryKey = regeneratePrimaryKey;
function regenerateSecondaryKey(apiClient, subscriptionId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("regenerateSecondaryKey");
        const maybeSubscription = yield getUserSubscription(apiClient, subscriptionId, userId);
        if (Option_1.isNone(maybeSubscription)) {
            return Option_1.none;
        }
        yield apiClient.subscription.regenerateSecondaryKey(config.azurermResourceGroup, config.azurermApim, subscriptionId);
        return getUserSubscription(apiClient, subscriptionId, userId);
    });
}
exports.regenerateSecondaryKey = regenerateSecondaryKey;
/**
 * Return the corresponding API management user
 * given the Active Directory B2C user's email.
 */
function getApimUser(apiClient, email) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getApimUser");
        const results = yield apiClient.user.listByService(config.azurermResourceGroup, config.azurermApim, { filter: "email eq '" + email + "'" });
        logger_1.logger.debug("apimUsers found", results);
        if (!results || results.length === 0) {
            return Option_1.none;
        }
        const user = results[0];
        if (!user.id || !user.name) {
            return Option_1.none;
        }
        // return first matching user
        return Option_1.some(Object.assign({ id: user.id, name: user.name }, user));
    });
}
exports.getApimUser = getApimUser;
function addUserSubscriptionToProduct(apiClient, userId, productName) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("addUserToProduct");
        const product = yield apiClient.product.get(config.azurermResourceGroup, config.azurermApim, productName);
        if (!product || !product.id) {
            return Either_1.left(new Error("Cannot find API management product for update"));
        }
        const subscriptionId = ulid_1.ulid();
        // For some odd reason in the Azure ARM API
        // user.name here is actually the user.id.
        // We do not skip existing subscriptions
        // so we can activate a canceled one.
        return Either_1.right(yield apiClient.subscription.createOrUpdate(config.azurermResourceGroup, config.azurermApim, subscriptionId, {
            displayName: subscriptionId,
            productId: product.id,
            state: "active",
            userId
        }));
    });
}
exports.addUserSubscriptionToProduct = addUserSubscriptionToProduct;
/**
 * Returns the array of added groups names (as strings).
 */
function addUserToGroups(apiClient, user, groups) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("addUserToGroups");
        if (!user || !user.name) {
            return Either_1.left(new Error("Cannot parse user"));
        }
        const existingGroups = yield apiClient.userGroup.list(config.azurermResourceGroup, config.azurermApim, user.name);
        const existingGroupsNames = new Set(existingGroups.map(g => g.name));
        logger_1.logger.debug("addUserToGroups|groups|%s", existingGroupsNames);
        const missingGroups = new Set(groups.filter(g => !existingGroupsNames.has(g)));
        if (missingGroups.size === 0) {
            logger_1.logger.debug("addUserToGroups|user already belongs to groups|%s", existingGroupsNames);
            return Either_1.right([]);
        }
        // sequence the promises here as calling this method
        // concurrently seems to cause some issues assigning
        // users to groups
        return Either_1.right(yield groups.reduce((prev, group) => __awaiter(this, void 0, void 0, function* () {
            const addedGroups = yield prev;
            // For some odd reason in the Azure ARM API user.name
            // here is actually the user.id
            yield apiClient.groupUser.create(config.azurermResourceGroup, config.azurermApim, group, user.name);
            return [...addedGroups, group];
        }), Promise.resolve([])));
    });
}
exports.addUserToGroups = addUserToGroups;
//# sourceMappingURL=apim_operations.js.map