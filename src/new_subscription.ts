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
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import { APIClient, toEither } from "./api_client";
import { logger } from "./logger";

import { readableReport } from "italia-ts-commons/lib/reporters";
import { Service } from "../generated/api/Service";

const telemetryClient = new appinsights.TelemetryClient();

const notificationApiClient = APIClient(config.adminApiUrl, config.adminApiKey);

export const SubscriptionData = t.intersection([
  t.interface({
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
  }),
  t.partial({
    id: NonEmptyString
  })
]);
export type SubscriptionData = t.TypeOf<typeof SubscriptionData>;

/**
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
export async function subscribeApimUser(
  apiClient: ApiManagementClient,
  apimUser: IExtendedUserContract,
  subscriptionData: SubscriptionData,
  createService = true
): Promise<Either<Error, SubscriptionContract>> {
  try {
    const sandboxFiscalCode = config.sandboxFiscalCode;

    // apimUser must exists
    // creates a new subscription every time !
    logger.debug("subscribeApimUser|addUserSubscriptionToProduct");
    const errorOrSubscription = await addUserSubscriptionToProduct(
      apiClient,
      apimUser.id,
      config.apimProductName,
      subscriptionData.id
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
    // default parameter for Service creation (false in case of Subscription MANAGE)
    if (createService) {
      logger.debug("subscribeApimUser|upsertService");

      const errorOrService = Service.decode({
        authorized_cidrs: [],
        authorized_recipients: [sandboxFiscalCode],
        department_name: subscriptionData.department_name,
        organization_fiscal_code: subscriptionData.organization_fiscal_code,
        organization_name: subscriptionData.organization_name,
        service_id: subscription.name,
        service_name: subscriptionData.service_name
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

      telemetryClient.trackEvent({
        name: "onboarding.success",
        properties: {
          id: apimUser.id,
          username: `${apimUser.firstName} ${apimUser.lastName}`
        }
      });
    }

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
