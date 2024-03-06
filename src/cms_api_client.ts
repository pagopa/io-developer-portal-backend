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
import { NonEmptyString } from "italia-ts-commons/lib/strings";

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

const ServicePublication = t.type({
  status: t.union([t.literal("published"), NonEmptyString])
});
type ServicePublication = t.TypeOf<typeof ServicePublication>;

// Function to make a GET request with custom headers and validate the response
const fetchServicesCms = async <T>(
  url: string,
  headers: ServicesCmsHeader,
  decoder: t.Type<T, unknown, unknown>,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
) => {
  const response = await fetchApi(url, {
    headers: {
      ...headers,
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
    logger.error(`Response error url => ${url}`);
    logger.error(
      `Response error headers => {x-subscription-id:${headers["x-subscription-id"]}, x-user-email:${headers["x-user-email"]}, x-user-groups:${headers["x-user-groups"]}, x-user-id:${headers["x-user-id"]}}`
    );
    logger.error(`Response error status => ${response.status}`);
    logger.error(`Response error body => ${responseBody}`);
    throw new Error(`Request failed with status ${response.status}`);
  }
};

export const getCmsRestClient = (baseUrl: NonEmptyString) => ({
  getServiceLifecycle: (
    serviceId: NonEmptyString,
    params: ServicesCmsRequiredFields
  ): Promise<O.Option<ServiceLifecycle>> =>
    fetchServicesCms(
      `${baseUrl}/services/${serviceId}`,
      fnCmsHeaderProducer(params),
      ServiceLifecycle
    ),
  getServicePublication: (
    serviceId: NonEmptyString,
    params: ServicesCmsRequiredFields
  ): Promise<O.Option<ServicePublication>> =>
    fetchServicesCms(
      `${baseUrl}/services/${serviceId}/release`,
      fnCmsHeaderProducer(params),
      ServicePublication
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