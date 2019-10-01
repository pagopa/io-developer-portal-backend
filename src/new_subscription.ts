/**
 * Procedure to create a new subscription beloging to the logged in user:
 *
 * 1. Subscribes the user to the configured API management product
 * 2. Adds the user to the configured API management groups
 * 3. Creates a new Profile with a fake fiscal number
 * 4. Creates a new Service linked to the new subscription
 */
import ApiManagementClient from "azure-arm-apimanagement";
import * as t from "io-ts";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";

import { SubscriptionContract } from "azure-arm-apimanagement/lib/models";

import {
  addUserSubscriptionToProduct,
  IExtendedUserContract
} from "./apim_operations";

import * as config from "./config";

import * as appinsights from "applicationinsights";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import randomstring = require("randomstring");
import { APIClient, toEither } from "./api_client";
import { logger } from "./logger";

import { readableReport } from "italia-ts-commons/lib/reporters";
import { NewMessage } from "../generated/api/NewMessage";
import { Service } from "../generated/api/Service";

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

export const SubscriptionData = t.interface({
  department_name: NonEmptyString,
  new_user: t.union([
    t.undefined,
    t.interface({
      adb2c_id: NonEmptyString,
      email: EmailString,
      first_name: NonEmptyString,
      last_name: NonEmptyString
    })
  ]),
  organization_fiscal_code: OrganizationFiscalCode,
  organization_name: NonEmptyString,
  service_name: NonEmptyString
});
export type SubscriptionData = t.TypeOf<typeof SubscriptionData>;

/**
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
export async function subscribeApimUser(
  apiClient: ApiManagementClient,
  apimUser: IExtendedUserContract,
  subscriptionData: SubscriptionData
): Promise<Either<Error, SubscriptionContract>> {
  try {
    // apimUser must exists
    // creates a new subscription every time !
    logger.debug("subscribeApimUser|addUserSubscriptionToProduct");
    const errorOrSubscription = await addUserSubscriptionToProduct(
      apiClient,
      apimUser.id,
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

    logger.debug("subscribeApimUser|createDevelopmentProfile");
    const fakeFiscalCode = generateFakeFiscalCode();

    const errorOrProfileResponse = toEither(
      await notificationApiClient.createDevelopmentProfile({
        fiscalCode: fakeFiscalCode,
        newProfile: {
          email: apimUser.email as EmailString
        }
      })
    );

    if (isLeft(errorOrProfileResponse)) {
      return left(new Error(`createDevelopmentProfile|response|${errorOrProfileResponse.value.message}`));
    }

    logger.debug("subscribeApimUser|upsertService");

    const errorOrService = Service.decode({
      authorized_cidrs: [],
      authorized_recipients: [fakeFiscalCode],
      department_name: subscriptionData.department_name || "department",
      organization_fiscal_code:
        subscriptionData.organization_fiscal_code || "00000000000",
      organization_name: subscriptionData.organization_name || "organization",
      service_id: subscription.name,
      service_name: subscriptionData.service_name || "service"
    });
    if (isLeft(errorOrService)) {
      return left(
        new Error(
          "upsertService|decode error|" + readableReport(errorOrService.value)
        )
      );
    }
    const service = errorOrService.value;

    // creates a new service every time !
    const errorOrServiceResponse = toEither(
      await notificationApiClient.createService({
        service
      })
    );
    if (isLeft(errorOrServiceResponse)) {
      return left(
        new Error(
          "upsertService|response|" + errorOrServiceResponse.value.message
        )
      );
    }

    logger.debug("subscribeApimUser|sending message");

    const errorOrMessage = NewMessage.decode({
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
    if (isLeft(errorOrMessage)) {
      return left(
        new Error(
          "sendMessage|decode error|" + readableReport(errorOrMessage.value)
        )
      );
    }
    const message = errorOrMessage.value;

    logger.debug(
      "sendMessage|message|" + fakeFiscalCode + "|" + JSON.stringify(message)
    );

    const errorOrMessageResponse = toEither(
      await notificationApiClient.sendMessage({
        fiscalCode: fakeFiscalCode,
        message
      })
    );
    if (isLeft(errorOrMessageResponse)) {
      return left(
        new Error("sendMessage|error|" + errorOrMessageResponse.value.message)
      );
    }

    logger.debug("sendMessage|message sent");

    telemetryClient.trackEvent({
      name: "onboarding.success",
      properties: {
        id: apimUser.id,
        username: `${apimUser.firstName} ${apimUser.lastName}`
      }
    });

    return right(subscription);
  } catch (e) {
    telemetryClient.trackEvent({
      name: "onboarding.failure",
      properties: {
        id: apimUser.id,
        username: `${apimUser.firstName} ${apimUser.lastName}`
      }
    });
    telemetryClient.trackException({ exception: e });
    logger.error("subscribeApimUser|error|%s", JSON.stringify(e));
  }
  return left(new Error("Cannot add user to subscription."));
}
