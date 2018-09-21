import ApiManagementClient from "azure-arm-apimanagement";

import { IProfile } from "./bearer_strategy";

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

import { createFakeProfile } from "./fake_profile";

import { upsertService } from "./service";

import { sendMessage } from "./message";

import * as appinsights from "applicationinsights";
import { logger } from "./logger";

const telemetryClient = new appinsights.TelemetryClient();

/**
 * Convert a profile obtained from oauth authentication
 * to the user data needed to perform API operations.
 */
function toUserData(profile: IProfile): IUserData {
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
  profile: IProfile
): Promise<Either<Error, SubscriptionContract>> {
  const userData = toUserData(profile);
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
    const fakeFiscalCode = await createFakeProfile(config.adminApiKey, {
      email: userData.email,
      version: 0
    });

    logger.debug("subscribeApimUser|upsertService");

    // creates a new service every time !
    await upsertService(config.adminApiKey, {
      authorized_cidrs: [],
      authorized_recipients: [fakeFiscalCode],
      department_name: profile.extension_Department || "",
      organization_fiscal_code: "00000000000",
      organization_name: profile.extension_Organization || "",
      service_id: subscription.name,
      service_name: profile.extension_Service || ""
    });

    logger.debug("subscribeApimUser|sendMessage");
    await sendMessage(config.adminApiKey, fakeFiscalCode, {
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
