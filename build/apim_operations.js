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
const json_set_map_1 = require("json-set-map");
const msRestAzure = require("ms-rest-azure");
const logger_1 = require("./logger");
const memoizee = require("memoizee");
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
        const isTokenExpired = tokenCreds
            ? tokenCreds.expiresOn <= Date.now()
            : false;
        logger_1.logger.debug("loginToApim() token expires in %d seconds. expired=%s", tokenCreds ? Math.round(tokenCreds.expiresOn - Date.now() / 1000) : 0, isTokenExpired);
        // return old credentials in case the token is not expired
        if (tokenCreds && !isTokenExpired) {
            logger_1.logger.debug("loginToApim(): get cached token");
            return tokenCreds;
        }
        logger_1.logger.debug("loginToApim(): login with MSI");
        const loginCreds = yield msRestAzure.loginWithAppServiceMSI();
        const token = yield getToken(loginCreds);
        return {
            // cache token for 1 hour
            // we cannot use tokenCreds.token.expiresOn
            // because of a bug in ms-rest-library
            // see https://github.com/Azure/azure-sdk-for-node/pull/3679
            expiresOn: Date.now() + 3600 * 1000,
            loginCreds,
            token
        };
    });
}
exports.loginToApim = loginToApim;
function getUserSubscription__(apiClient, subscriptionId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getUserSubscription");
        const subscription = yield apiClient.subscription.get(config.azurermResourceGroup, config.azurermApim, subscriptionId);
        if ((userId && subscription.userId !== userId) || !subscription.name) {
            return Option_1.none;
        }
        return Option_1.some(Object.assign({ name: subscription.name }, subscription));
    });
}
exports.getUserSubscription = memoizee(getUserSubscription__, {
    max: 100,
    maxAge: 3600000,
    normalizer: args => args[1] + ":" + args[2],
    profileName: "getUserSubscription",
    promise: true
});
function getUserSubscriptions(apiClient, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getUserSubscriptions");
        // TODO: this list is paginated with a next-link
        // by now we get only the first result page
        return apiClient.userSubscription.list(config.azurermResourceGroup, config.azurermApim, userId);
    });
}
exports.getUserSubscriptions = getUserSubscriptions;
function regenerateKey__(apiClient, subscriptionId, userId, keyType) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("regeneratePrimaryKey");
        const maybeSubscription = yield getUserSubscription__(apiClient, subscriptionId, userId);
        if (Option_1.isNone(maybeSubscription)) {
            return Option_1.none;
        }
        switch (keyType) {
            case "primary":
                yield apiClient.subscription.regeneratePrimaryKey(config.azurermResourceGroup, config.azurermApim, subscriptionId);
                break;
            case "secondary":
                yield apiClient.subscription.regenerateSecondaryKey(config.azurermResourceGroup, config.azurermApim, subscriptionId);
                break;
        }
        return getUserSubscription__(apiClient, subscriptionId, userId);
    });
}
exports.regeneratePrimaryKey = (apiClient, subscriptionId, userId) => {
    // invalidate subscriptions cache
    // tslint:disable-next-line:no-any
    exports.getUserSubscription.delete({}, subscriptionId, userId);
    return regenerateKey__(apiClient, subscriptionId, userId, "primary");
};
exports.regenerateSecondaryKey = (apiClient, subscriptionId, userId) => {
    // invalidate subscriptions cache
    // tslint:disable-next-line:no-any
    exports.getUserSubscription.delete({}, subscriptionId, userId);
    return regenerateKey__(apiClient, subscriptionId, userId, "secondary");
};
/**
 * Return the corresponding API management user
 * given the Active Directory B2C user's email.
 */
function getApimUser__(apiClient, email) {
    return __awaiter(this, void 0, void 0, function* () {
        logger_1.logger.debug("getApimUser");
        const results = yield apiClient.user.listByService(config.azurermResourceGroup, config.azurermApim, { filter: "email eq '" + email + "'" });
        logger_1.logger.debug("lookup apimUsers for (%s) (%s)", email, JSON.stringify(results));
        if (!results || results.length === 0) {
            return Option_1.none;
        }
        const user = results[0];
        if (!user.id || !user.name || !user.email || !user.email[0]) {
            return Option_1.none;
        }
        const groupNames = yield getUserGroups(apiClient, user);
        const apimUser = Object.assign({ email: user.email, id: user.id, name: user.name }, user, { groupNames: Option_1.isSome(groupNames)
                ? new json_set_map_1.Set(groupNames.value)
                : new json_set_map_1.Set() });
        // return first matching user
        return Option_1.some(apimUser);
    });
}
exports.getApimUser = memoizee(getApimUser__, {
    max: 100,
    maxAge: 3600000,
    normalizer: args => args[1],
    profileName: "getApimUser",
    promise: true
});
function isAdminUser(user) {
    logger_1.logger.debug("User's groupNames [%s]", Array.from(user.groupNames));
    return user.groupNames.has("ApiAdmin");
}
exports.isAdminUser = isAdminUser;
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
function removeUserFromGroups(apiClient, user, groups) {
    return __awaiter(this, void 0, void 0, function* () {
        return Either_1.right(yield groups.reduce((prev, group) => __awaiter(this, void 0, void 0, function* () {
            const removedGroups = yield prev;
            logger_1.logger.debug("removeUserFromGroups (%s)", group);
            // For some odd reason in the Azure ARM API user.name
            // here is actually the user.id
            yield apiClient.groupUser.deleteMethod(config.azurermResourceGroup, config.azurermApim, group, user.name);
            return [...removedGroups, group];
        }), Promise.resolve([])));
    });
}
exports.removeUserFromGroups = removeUserFromGroups;
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
        const existingGroupsNames = new json_set_map_1.Set(existingGroups.map(g => g.name));
        logger_1.logger.debug("addUserToGroups|existing groups|%s", JSON.stringify(Array.from(existingGroupsNames)));
        const missingGroups = new json_set_map_1.Set(groups.filter(g => !existingGroupsNames.has(g)));
        if (missingGroups.size === 0) {
            logger_1.logger.debug("addUserToGroups|user already belongs to groups|%s", JSON.stringify(Array.from(existingGroupsNames)));
            return Either_1.right([]);
        }
        // sequence the promises here as calling this method
        // concurrently seems to cause some issues assigning
        // users to groups
        return Either_1.right(yield Array.from(missingGroups).reduce((prev, group) => __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.debug("addUserToGroups|adding user to group (%s)", group);
            const addedGroups = yield prev;
            // If the user already belongs to the unlimited group related
            // to the new group, do not add the user to the limited one
            // (aka: avoids to restrict user rights when adding new subscriptions)
            if (existingGroupsNames.has(group.replace(/Limited/, "")) ||
                existingGroupsNames.has(group.replace(/Limited/, "Full"))) {
                logger_1.logger.debug("addUserToGroups|skipping limited group (%s)", group);
                return addedGroups;
            }
            // For some odd reason in the Azure ARM API user.name
            // here is actually the user.id
            yield apiClient.groupUser.create(config.azurermResourceGroup, config.azurermApim, group, user.name);
            return [...addedGroups, group];
        }), Promise.resolve([])));
    });
}
exports.addUserToGroups = addUserToGroups;
function getUserGroups(apiClient, user) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!user.name) {
            return Option_1.none;
        }
        const existingGroups = yield apiClient.userGroup.list(config.azurermResourceGroup, config.azurermApim, user.name);
        return Option_1.some(existingGroups.map(g => g.name));
    });
}
exports.getUserGroups = getUserGroups;
function getApimUsers(apiClient) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:readonly-array no-let
        let users = [];
        logger_1.logger.debug("getUsers");
        // tslint:disable-next-line:no-let
        let nextUsers = yield apiClient.user.listByService(config.azurermResourceGroup, config.azurermApim);
        users = users.concat(nextUsers);
        while (nextUsers.nextLink) {
            logger_1.logger.debug("getUsers (%s)", nextUsers.nextLink);
            nextUsers = yield apiClient.user.listByServiceNext(nextUsers.nextLink);
            users = users.concat(nextUsers);
        }
        return users;
    });
}
exports.getApimUsers = getApimUsers;
//# sourceMappingURL=apim_operations.js.map