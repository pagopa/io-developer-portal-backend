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
const types_1 = require("italia-ts-commons/lib/types");
const logger_1 = require("../logger");
const t = require("io-ts");
const DepartmentName_1 = require("../api/DepartmentName");
const MaxAllowedPaymentAmount_1 = require("../api/MaxAllowedPaymentAmount");
const OrganizationName_1 = require("../api/OrganizationName");
const ServiceName_1 = require("../api/ServiceName");
exports.ServicePayload = t.partial({
    authorized_cidrs: t.readonlyArray(strings_1.CIDR, "array of CIDR"),
    authorized_recipients: t.readonlyArray(strings_1.FiscalCode, "array of FiscalCode"),
    department_name: DepartmentName_1.DepartmentName,
    is_visible: types_1.withDefault(t.boolean, false),
    max_allowed_payment_amount: MaxAllowedPaymentAmount_1.MaxAllowedPaymentAmount,
    organization_fiscal_code: strings_1.OrganizationFiscalCode,
    organization_name: OrganizationName_1.OrganizationName,
    service_name: ServiceName_1.ServiceName
});
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
        // if the user is an admin we skip the check on userId
        const maybeSubscription = yield apim_operations_1.getUserSubscription(apiClient, serviceId, apim_operations_1.isAdminUser(apimUser) ? undefined : apimUser.id);
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
        const authenticatedApimUser = maybeApimUser.value;
        // Authenticates this request against the logged in user
        // checking that serviceId = subscriptionId
        // if the user is an admin we skip the check on userId
        const maybeSubscription = yield apim_operations_1.getUserSubscription(apiClient, serviceId, apim_operations_1.isAdminUser(authenticatedApimUser) ? undefined : authenticatedApimUser.id);
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
        logger_1.logger.debug("updating service %s", JSON.stringify(Object.assign({}, service, servicePayload)));
        const payload = !apim_operations_1.isAdminUser(authenticatedApimUser)
            ? types_1.pick([
                "department_name",
                "organization_fiscal_code",
                "organization_name",
                "service_name"
            ], servicePayload)
            : servicePayload;
        const errorOrUpdatedService = api_client_1.toEither(yield notificationApiClient.updateService({
            service: Object.assign({}, service, payload),
            serviceId
        }));
        return errorOrUpdatedService.fold(errs => responses_1.ResponseErrorInternal("Error updating service: " + errs.message), responses_1.ResponseSuccessJson);
    });
}
exports.putService = putService;
//# sourceMappingURL=services.js.map