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
const strings_1 = require("italia-ts-commons/lib/strings");
const api_client_1 = require("../api_client");
const apim_operations_1 = require("../apim_operations");
const config = require("../config");
const t = require("io-ts");
/**
 * Service fields editable by the user.
 */
const ServicePayload = t.exact(t.interface({
    department_name: strings_1.NonEmptyString,
    organization_fiscal_code: strings_1.OrganizationFiscalCode,
    organization_name: strings_1.NonEmptyString,
    service_name: strings_1.NonEmptyString
}));
const notificationApiClient = api_client_1.APIClient(config.adminApiUrl, config.adminApiKey);
/**
 * Get service data for a specific serviceId.
 */
function getService(apiClient, authenticatedUser, serviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const maybeApimUser = yield apim_operations_1.getApimUser(apiClient, authenticatedUser.emails[0]);
        if (Option_1.isNone(maybeApimUser)) {
            return responses_1.ResponseErrorNotFound("API user not found", "Cannot find a user in the API management with the provided email address");
        }
        const apimUser = maybeApimUser.value;
        // Authenticates this request against the logged in user
        // checking that serviceId = subscriptionId
        const maybeSubscription = yield apim_operations_1.getUserSubscription(apiClient, serviceId, apimUser.id);
        if (Option_1.isNone(maybeSubscription)) {
            return responses_1.ResponseErrorInternal("Cannot get user subscription");
        }
        const errorOrServiceResponse = api_client_1.toEither(yield notificationApiClient.getService({
            id: serviceId
        }));
        if (Either_1.isLeft(errorOrServiceResponse)) {
            return responses_1.ResponseErrorNotFound("Cannot get service", "Cannot get existing service");
        }
        const service = errorOrServiceResponse.value;
        return responses_1.ResponseSuccessJson(service);
    });
}
exports.getService = getService;
/**
 * Update service data for/with a specific serviceId.
 */
function putService(apiClient, authenticatedUser, serviceId, servicePayload) {
    return __awaiter(this, void 0, void 0, function* () {
        const maybeApimUser = yield apim_operations_1.getApimUser(apiClient, authenticatedUser.emails[0]);
        if (Option_1.isNone(maybeApimUser)) {
            return responses_1.ResponseErrorNotFound("API user not found", "Cannot find a user in the API management with the provided email address");
        }
        const apimUser = maybeApimUser.value;
        // Authenticates this request against the logged in user
        // checking that he owns a subscription with the provided serviceId
        const maybeSubscription = yield apim_operations_1.getUserSubscription(apiClient, serviceId, apimUser.id);
        if (Option_1.isNone(maybeSubscription)) {
            return responses_1.ResponseErrorNotFound("Subscription not found", "Cannot get a subscription for the logged in user");
        }
        // Get old service data
        const errorOrService = api_client_1.toEither(yield notificationApiClient.getService({
            id: serviceId
        }));
        if (Either_1.isLeft(errorOrService)) {
            return responses_1.ResponseErrorNotFound("Service not found", "Cannot get a service with the provided id.");
        }
        const service = errorOrService.value;
        // TODO: get the old service then filter only
        // authorized fields and merge the changes
        const errorOrUpdatedService = api_client_1.toEither(yield notificationApiClient.updateService({
            service: Object.assign({}, service, servicePayload),
            serviceId
        }));
        return errorOrUpdatedService.fold(errs => responses_1.ResponseErrorInternal("Error updating service: " + errs.message), responses_1.ResponseSuccessJson);
    });
}
exports.putService = putService;
//# sourceMappingURL=services.js.map