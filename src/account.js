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
 * Create API manager users and subscriptions.
 *
 */
// tslint:disable:no-console
// tslint:disable:no-any
const apiManagementClient = require("azure-arm-apimanagement");
const config = require("local.config");
const login_1 = require("login");
const addUserToProduct = (apiClient, user, productName) => __awaiter(this, void 0, void 0, function* () {
    const product = yield apiClient.product.get(config.azurerm_resource_group, config.azurerm_apim, productName);
    if (user && user.id && product && product.id) {
        apiClient.subscription.createOrUpdate(config.azurerm_resource_group, config.azurerm_apim, `sid-${user.email}-${productName}`, {
            displayName: `sid-${user.email}-${productName}`,
            productId: product.id,
            state: "active",
            userId: user.id
        });
    }
});
const createOrUpdateUser = (apiClient, user) => apiClient.user.createOrUpdate(config.azurerm_resource_group, config.azurerm_apim, user.email, user);
const addUserToGroups = (apiClient, user, groups) => {
    Promise.all(groups.map((group) => __awaiter(this, void 0, void 0, function* () {
        if (user && user.email) {
            return yield apiClient.groupUser.create(config.azurerm_resource_group, config.azurerm_apim, group, user.email);
        }
        return Promise.resolve();
    })));
};
exports.run = () => __awaiter(this, void 0, void 0, function* () {
    const loginCreds = yield login_1.login();
    const apiClient = new apiManagementClient(loginCreds.creds, loginCreds.subscriptionId);
    for (const userData of [].data) {
        const user = yield createOrUpdateUser(apiClient, userData);
        yield addUserToGroups(apiClient, user, userData.groups);
        yield addUserToProduct(apiClient, user, userData.productName);
    }
});
exports.run()
    .then(() => console.log("successfully created/updated api manager users"))
    .catch(console.error);
//# sourceMappingURL=account.js.map