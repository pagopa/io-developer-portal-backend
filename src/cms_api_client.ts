/**
 * REST client for Services CMS APIs.
 * See spec here: https://raw.githubusercontent.com/pagopa/io-services-cms/master/apps/io-services-cms-webapp/openapi.yaml
 */

import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";
import nodeFetch from "node-fetch";
import { logger } from "./logger";

import { EmailString } from "@pagopa/ts-commons/lib/strings";
import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

const ServicesCmsRequiredFields = t.type({
  subscriptionId: NonEmptyString,
  userEmail: EmailString,
  userGroups: t.array(NonEmptyString),
  userId: NonEmptyString
});
type ServicesCmsRequiredFields = t.TypeOf<typeof ServicesCmsRequiredFields>;

const ServicesCmsHeader = t.type({
  "x-subscription-id": NonEmptyString,
  "x-user-email": EmailString,
  "x-user-groups": NonEmptyString,
  "x-user-id": NonEmptyString
});
type ServicesCmsHeader = t.TypeOf<typeof ServicesCmsHeader>;

const ServiceLifecycle = t.type({
  status: t.type({
    value: t.union([t.literal("approved"), NonEmptyString])
  })
});
type ServiceLifecycle = t.TypeOf<typeof ServiceLifecycle>;

const CheckServiceDuplicatesResponse = t.intersection([
  t.type({
    is_duplicate: t.boolean
  }),
  t.partial({
    // SPID user fiscal code
    service_id: NonEmptyString
  })
]);
type CheckServiceDuplicatesResponse = t.TypeOf<
  typeof CheckServiceDuplicatesResponse
>;

const ServicePublication = t.type({
  status: t.union([t.literal("published"), NonEmptyString])
});
type ServicePublication = t.TypeOf<typeof ServicePublication>;

// Function to make a GET request with custom headers and validate the response
const fetchServicesCms = async <T>(
  url: string,
  decoder: t.Type<T, unknown, unknown>,
  headers?: ServicesCmsHeader,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
) => {
  const response = await fetchApi(url, {
    headers: {
      ...(headers ? headers : {}),
      "Content-Type": "application/json"
    },
    method: "GET"
  });

  if (response.status === 404) {
    return O.none;
  } else if (response.ok) {
    // Parse the JSON response and validate it against the io-ts type
    const responseBody = await response.json();
    const validationResult = decoder.decode(responseBody);
    // Check if the response matches the expected type
    if (validationResult._tag === "Left") {
      throw new Error(
        `Response validation failed: ${readableReport(validationResult.value)}`
      );
    }

    return O.some(validationResult.value);
  } else {
    const responseBody = await response.text();
    logger.error(
      `An Error has occurred on fetchServicesCms, the reason was => Response error url ${url}`
    );
    if (headers) {
      logger.error(
        `An Error has occurred on fetchServicesCms, the reason was => Response error headers {x-subscription-id:${headers["x-subscription-id"]}, x-user-email:${headers["x-user-email"]}, x-user-groups:${headers["x-user-groups"]}, x-user-id:${headers["x-user-id"]}}`
      );
    }

    logger.error(
      `An Error has occurred on fetchServicesCms, the reason was => Response error status ${response.status}`
    );
    logger.error(
      `An Error has occurred on fetchServicesCms, the reason was => Response error body ${responseBody}`
    );
    throw new Error(`Request failed with status ${response.status}`);
  }
};

export const getCmsRestClient = (baseUrl: NonEmptyString) => ({
  checkServiceDuplication: (
    organizationFiscalCode: OrganizationFiscalCode,
    serviceName: NonEmptyString,
    serviceId?: NonEmptyString
  ): Promise<O.Option<CheckServiceDuplicatesResponse>> => {
    const endpoint = `${baseUrl}/internal/services/duplicates?serviceName=${serviceName}&organizationFiscalCode=${organizationFiscalCode}`;

    const fullEndpoint = serviceId
      ? endpoint + `&serviceId=${serviceId}`
      : endpoint;

    return fetchServicesCms(fullEndpoint, CheckServiceDuplicatesResponse);
  },
  getServiceLifecycle: (
    serviceId: NonEmptyString,
    params: ServicesCmsRequiredFields
  ): Promise<O.Option<ServiceLifecycle>> =>
    fetchServicesCms(
      `${baseUrl}/internal/services/${serviceId}`,
      ServiceLifecycle,
      fnCmsHeaderProducer(params)
    ),
  getServicePublication: (
    serviceId: NonEmptyString,
    params: ServicesCmsRequiredFields
  ): Promise<O.Option<ServicePublication>> =>
    fetchServicesCms(
      `${baseUrl}/internal/services/${serviceId}/release`,
      ServicePublication,
      fnCmsHeaderProducer(params)
    )
});

const fnCmsHeaderProducer = (
  params: ServicesCmsRequiredFields
): ServicesCmsHeader => ({
  "x-subscription-id": params.subscriptionId,
  "x-user-email": params.userEmail,
  "x-user-groups": params.userGroups.join(",") as NonEmptyString,
  "x-user-id": params.userId
});

export type CmsRestClient = ReturnType<typeof getCmsRestClient>;
