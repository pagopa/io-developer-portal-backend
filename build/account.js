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
/**
 * Methods used to add users to API manager Products and Groups.
 */
const azure_arm_apimanagement_1 = require("azure-arm-apimanagement");
const msRestAzure = require("ms-rest-azure");
const winston = require("winston");
const config = require("./config");
const ulid_1 = require("ulid");
function newApiClient() {
    return __awaiter(this, void 0, void 0, function* () {
        const loginCreds = yield msRestAzure.loginWithAppServiceMSI();
        return new azure_arm_apimanagement_1.ApiManagementClient(loginCreds, config.subscriptionId);
    });
}
exports.newApiClient = newApiClient;
exports.getUserSubscription = (apiClient, subscriptionId) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("getUserSubscription");
    return apiClient.subscription.get(config.azurermResourceGroup, config.azurermApim, subscriptionId);
});
exports.getUserSubscriptions = (apiClient, userId) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("getUserSubscriptions");
    // TODO: this list is paginated with a next-link
    // by now we get only the first result page
    return apiClient.userSubscription.list(config.azurermResourceGroup, config.azurermApim, userId);
});
exports.regeneratePrimaryKey = (apiClient, subscriptionId) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("regeneratePrimaryKey");
    yield apiClient.subscription.regeneratePrimaryKey(config.azurermResourceGroup, config.azurermApim, subscriptionId);
    return exports.getUserSubscription(apiClient, subscriptionId);
});
exports.regenerateSecondaryKey = (apiClient, subscriptionId) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("regenerateSecondaryKey");
    yield apiClient.subscription.regenerateSecondaryKey(config.azurermResourceGroup, config.azurermApim, subscriptionId);
    return exports.getUserSubscription(apiClient, subscriptionId);
});
exports.getApimUser = (apiClient, email) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("getApimUser");
    const results = yield apiClient.user.listByService(config.azurermResourceGroup, config.azurermApim, { filter: "email eq '" + email + "'" });
    winston.debug("apimUsers found", results);
    if (!results || results.length === 0) {
        return undefined;
    }
    // return first matching user
    return results[0];
});
exports.getExistingUser = (apiClient, userId) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("getExistingUser");
    return apiClient.user.get(config.azurermResourceGroup, config.azurermApim, userId);
});
exports.addUserSubscriptionToProduct = (apiClient, user, productName) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("addUserToProduct");
    const product = yield apiClient.product.get(config.azurermResourceGroup, config.azurermApim, productName);
    if (user && user.id && user.name && product && product.id && productName) {
        const subscriptionId = ulid_1.ulid();
        // For some odd reason in the Azure ARM API
        // user.name here is actually the user.id.
        // We do not skip existing subscriptions
        // so we can activate a canceled one.
        return apiClient.subscription.createOrUpdate(config.azurermResourceGroup, config.azurermApim, subscriptionId, {
            displayName: subscriptionId,
            productId: product.id,
            state: "active",
            userId: user.id
        });
    }
    else {
        return Promise.reject(new Error("Cannot find API manager product for update"));
    }
});
exports.addUserToGroups = (apiClient, user, groups) => __awaiter(this, void 0, void 0, function* () {
    winston.debug("addUserToGroups");
    if (!user || !user.name) {
        return Promise.reject(new Error("Cannot parse user"));
    }
    const existingGroups = yield apiClient.userGroup.list(config.azurermResourceGroup, config.azurermApim, user.name);
    const existingGroupsNames = new Set(existingGroups.map(g => g.name));
    winston.debug("addUserToGroups|groups|", existingGroupsNames);
    const missingGroups = new Set(groups.filter(g => !existingGroupsNames.has(g)));
    if (missingGroups.size === 0) {
        winston.debug("addUserToGroups|user already belongs to groups|", existingGroupsNames);
        return Promise.resolve(user);
    }
    // sequence the promises here as calling this method
    // concurrently seems to cause some oddities assigning
    // users to groups
    return groups.reduce((prev, group) => {
        // For some odd reason in the Azure ARM API user.name here is
        // in reality the user.id
        return prev.then(_ => {
            return apiClient.groupUser.create(config.azurermResourceGroup, config.azurermApim, group, user.name);
        });
    }, Promise.resolve({}));
});
//# sourceMappingURL=account.js.map