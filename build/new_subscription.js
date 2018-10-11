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
const t = require("io-ts");
const Either_1 = require("fp-ts/lib/Either");
const apim_operations_1 = require("./apim_operations");
const config = require("./config");
const appinsights = require("applicationinsights");
const strings_1 = require("italia-ts-commons/lib/strings");
const randomstring = require("randomstring");
const api_client_1 = require("./api_client");
const logger_1 = require("./logger");
const reporters_1 = require("italia-ts-commons/lib/reporters");
const ExtendedProfile_1 = require("./api/ExtendedProfile");
const NewMessage_1 = require("./api/NewMessage");
const Service_1 = require("./api/Service");
const telemetryClient = new appinsights.TelemetryClient();
const notificationApiClient = api_client_1.APIClient(config.adminApiUrl, config.adminApiKey);
/**
 * Generate a fake fiscal code.
 * Avoids collisions with real ones as we use
 * a literal "Y" for the location field.
 */
function generateFakeFiscalCode() {
    const s = randomstring.generate({
        capitalization: "uppercase",
        charset: "alphabetic",
        length: 6
    });
    const d = randomstring.generate({
        charset: "numeric",
        length: 7
    });
    return [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join("");
}
exports.SubscriptionData = t.interface({
    department_name: strings_1.NonEmptyString,
    organization_fiscal_code: strings_1.OrganizationFiscalCode,
    organization_name: strings_1.NonEmptyString,
    service_name: strings_1.NonEmptyString
});
/**
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
function subscribeApimUser(apiClient, apimUser, subscriptionData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // creates a new subscription every time !
            logger_1.logger.debug("subscribeApimUser|addUserSubscriptionToProduct");
            const errorOrSubscription = yield apim_operations_1.addUserSubscriptionToProduct(apiClient, apimUser.id, config.apimProductName);
            if (Either_1.isLeft(errorOrSubscription)) {
                return Either_1.left(new Error("subscribeApimUser|getApimUser|no subscription found"));
            }
            const subscription = errorOrSubscription.value;
            if (!subscription.name) {
                return Either_1.left(new Error("subscribeApimUser|getApimUser|subscription found but has empty name"));
            }
            logger_1.logger.debug("subscribeApimUser|createFakeProfile");
            const fakeFiscalCode = generateFakeFiscalCode();
            const errorOrProfile = ExtendedProfile_1.ExtendedProfile.decode({
                email: apimUser.email,
                is_inbox_enabled: true,
                is_webhook_enabled: true,
                version: 0
            });
            if (Either_1.isLeft(errorOrProfile)) {
                return Either_1.left(new Error(reporters_1.readableReport(errorOrProfile.value)));
            }
            const profile = errorOrProfile.value;
            const errorOrProfileResponse = api_client_1.toEither(yield notificationApiClient.createOrUpdateProfile({
                fiscalCode: fakeFiscalCode,
                newProfile: profile
            }));
            if (Either_1.isLeft(errorOrProfileResponse)) {
                return Either_1.left(new Error(errorOrProfileResponse.value.message));
            }
            logger_1.logger.debug("subscribeApimUser|upsertService");
            const errorOrService = Service_1.Service.decode({
                authorized_cidrs: [],
                authorized_recipients: [fakeFiscalCode],
                department_name: subscriptionData.department_name || "department",
                organization_fiscal_code: subscriptionData.organization_fiscal_code || "00000000000",
                organization_name: subscriptionData.organization_name || "organization",
                service_id: subscription.name,
                service_name: subscriptionData.service_name || "service"
            });
            if (Either_1.isLeft(errorOrService)) {
                return Either_1.left(new Error("upsertService|decode error|" + reporters_1.readableReport(errorOrService.value)));
            }
            const service = errorOrService.value;
            // creates a new service every time !
            const errorOrServiceResponse = api_client_1.toEither(yield notificationApiClient.createService({
                service
            }));
            if (Either_1.isLeft(errorOrServiceResponse)) {
                return Either_1.left(new Error("upsertService|response|" + errorOrServiceResponse.value.message));
            }
            logger_1.logger.debug("subscribeApimUser|sending message");
            const errorOrMessage = NewMessage_1.NewMessage.decode({
                content: {
                    markdown: [
                        `Hello,`,
                        `this is a bogus fiscal code you can use to start testing the Digital Citizenship API:\n`,
                        fakeFiscalCode,
                        `\nYou can start in the developer portal here:`,
                        config.apimUrl
                    ].join("\n"),
                    subject: `Welcome ${apimUser.firstName} ${apimUser.lastName} !`
                }
            });
            if (Either_1.isLeft(errorOrMessage)) {
                return Either_1.left(new Error("sendMessage|decode error|" + reporters_1.readableReport(errorOrMessage.value)));
            }
            const message = errorOrMessage.value;
            logger_1.logger.debug("sendMessage|message|" + fakeFiscalCode + "|" + JSON.stringify(message));
            const errorOrMessageResponse = api_client_1.toEither(yield notificationApiClient.sendMessage({
                fiscalCode: fakeFiscalCode,
                message
            }));
            if (Either_1.isLeft(errorOrMessageResponse)) {
                return Either_1.left(new Error("sendMessage|error|" + errorOrMessageResponse.value.message));
            }
            logger_1.logger.debug("sendMessage|message sent");
            telemetryClient.trackEvent({
                name: "onboarding.success",
                properties: {
                    id: apimUser.id,
                    username: `${apimUser.firstName} ${apimUser.lastName}`
                }
            });
            return Either_1.right(subscription);
        }
        catch (e) {
            telemetryClient.trackEvent({
                name: "onboarding.failure",
                properties: {
                    id: apimUser.id,
                    username: `${apimUser.firstName} ${apimUser.lastName}`
                }
            });
            telemetryClient.trackException({ exception: e });
            logger_1.logger.error("subscribeApimUser|error|%s", JSON.stringify(e));
        }
        return Either_1.left(new Error("Cannot add user to subscription."));
    });
}
exports.subscribeApimUser = subscribeApimUser;
//# sourceMappingURL=new_subscription.js.map