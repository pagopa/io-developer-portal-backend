/**
 * Procedure to create a new subscription beloging to the logged in user:
 *
 * 1. Subscribes the user to the configured API management product
 * 2. Adds the user to the configured API management groups
 * 3. Creates a new Profile with a fake fiscal number
 * 4. Creates a new Service linked to the new subscription
 */
import ApiManagementClient from "azure-arm-apimanagement";

import { AdUser } from "./bearer_strategy";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";

import { SubscriptionContract } from "azure-arm-apimanagement/lib/models";

import {
  addUserSubscriptionToProduct,
  addUserToGroups,
  getApimUser,
  IUserData
} from "./apim_operations";

import { isNone } from "fp-ts/lib/Option";

import * as config from "./config";

import * as appinsights from "applicationinsights";
import { EmailString, FiscalCode } from "italia-ts-commons/lib/strings";
import randomstring = require("randomstring");
import { CreatedMessageWithContent } from "./api/CreatedMessageWithContent";
import { APIClient, parseResponse } from "./api_client";
import { logger } from "./logger";

import { readableReport } from "italia-ts-commons/lib/reporters";
import { ExtendedProfile } from "./api/ExtendedProfile";
import { Service } from "./api/Service";
import { ServicePublic } from "./api/ServicePublic";

const telemetryClient = new appinsights.TelemetryClient();

const notificationApiClient = APIClient(config.adminApiUrl, config.adminApiKey);

/**
 * Generate a fake fiscal code.
 * Avoids collisions with real ones as we use
 * a literal "Y" for the location field.
 */
function generateFakeFiscalCode(): FiscalCode {
  const s = randomstring.generate({
    capitalization: "uppercase",
    charset: "alphabetic",
    length: 6
  });
  const d = randomstring.generate({
    charset: "numeric",
    length: 7
  });
  return [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join(
    ""
  ) as FiscalCode;
}

/**
 * Convert a profile obtained from oauth authentication
 * to the user data needed to perform API operations.
 */
function toUserData(profile: AdUser): IUserData {
  return {
    email: profile.emails[0],
    firstName: profile.given_name,
    groups: (config.apimUserGroups || "").split(","),
    lastName: profile.family_name,
    oid: profile.oid,
    productName: config.apimProductName
  };
}

/**
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
export async function subscribeApimUser(
  apiClient: ApiManagementClient,
  adUser: AdUser
): Promise<Either<Error, SubscriptionContract>> {
  const userData = toUserData(adUser);
  try {
    // user must already exists (is created at login)
    logger.debug("subscribeApimUser|getApimUser");
    const maybeUser = await getApimUser(apiClient, userData.email);

    if (isNone(maybeUser)) {
      return left(new Error("subscribeApimUser|getApimUser|no user found"));
    }
    const user = maybeUser.value;

    // idempotent
    logger.debug("subscribeApimUser|addUserToGroups");
    await addUserToGroups(apiClient, user, userData.groups);

    // creates a new subscription every time !
    logger.debug("subscribeApimUser|addUserSubscriptionToProduct");
    const errorOrSubscription = await addUserSubscriptionToProduct(
      apiClient,
      user.id,
      config.apimProductName
    );

    if (isLeft(errorOrSubscription)) {
      return left(
        new Error("subscribeApimUser|getApimUser|no subscription found")
      );
    }
    const subscription = errorOrSubscription.value;
    if (!subscription.name) {
      return left(
        new Error(
          "subscribeApimUser|getApimUser|subscription found but has empty name"
        )
      );
    }

    logger.debug("subscribeApimUser|createFakeProfile");
    const fakeFiscalCode = generateFakeFiscalCode();

    const errorOrProfile = ExtendedProfile.decode({
      email: userData.email as EmailString,
      version: 0
    });
    if (isLeft(errorOrProfile)) {
      return left(new Error(readableReport(errorOrProfile.value)));
    }
    const profile = errorOrProfile.value;

    const errorOrProfileResponse = parseResponse<ExtendedProfile>(
      await notificationApiClient.createOrUpdateProfile({
        fiscalCode: fakeFiscalCode,
        newProfile: profile
      })
    );

    if (isLeft(errorOrProfileResponse)) {
      return left(new Error(errorOrProfileResponse.value.message));
    }

    logger.debug("subscribeApimUser|upsertService");

    const errorOrService = Service.decode({
      authorized_cidrs: [],
      authorized_recipients: [fakeFiscalCode],
      department_name: adUser.extension_Department || "department",
      organization_fiscal_code: "00000000000",
      organization_name: adUser.extension_Organization || "organization",
      service_id: subscription.name,
      service_name: adUser.extension_Service || "service"
    });
    if (isLeft(errorOrService)) {
      return left(new Error(readableReport(errorOrService.value)));
    }
    const service = errorOrService.value;

    // creates a new service every time !
    const errorOrServiceResponse = parseResponse<ServicePublic>(
      await notificationApiClient.createService({
        service
      })
    );
    if (isLeft(errorOrServiceResponse)) {
      return left(new Error(errorOrServiceResponse.value.message));
    }

    const errorOrMessage = CreatedMessageWithContent.decode({
      content: {
        markdown: [
          `Hello,`,
          `this is a bogus fiscal code you can use to start testing the Digital Citizenship API:\n`,
          fakeFiscalCode,
          `\nYou can start in the developer portal here:`,
          config.apimUrl
        ].join("\n"),
        subject: `Welcome ${userData.firstName} ${userData.lastName} !`
      }
    });
    if (isLeft(errorOrMessage)) {
      return left(new Error(readableReport(errorOrMessage.value)));
    }
    const message = errorOrMessage.value;

    logger.debug("subscribeApimUser|sendMessage");

    const errorOrMessageResponse = parseResponse<CreatedMessageWithContent>(
      await notificationApiClient.sendMessage({
        fiscalCode: fakeFiscalCode,
        message
      })
    );
    if (isLeft(errorOrMessageResponse)) {
      return left(new Error(errorOrMessageResponse.value.message));
    }

    telemetryClient.trackEvent({
      name: "onboarding.success",
      properties: {
        id: userData.oid,
        username: `${userData.firstName} ${userData.lastName}`
      }
    });

    return right(subscription);
  } catch (e) {
    telemetryClient.trackEvent({
      name: "onboarding.failure",
      properties: {
        id: userData.oid,
        username: `${userData.firstName} ${userData.lastName}`
      }
    });
    telemetryClient.trackException({ exception: e });
    logger.error("subscribeApimUser|error|%s", JSON.stringify(e));
  }
  return left(new Error("Cannot add user to subscription."));
}
