/**
 * REST client for Services CMS APIs.
 * See spec here: https://raw.githubusercontent.com/pagopa/io-services-cms/master/apps/io-services-cms-webapp/openapi.yaml
 */

import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";

import { EmailString } from "@pagopa/ts-commons/lib/strings";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

const ServicesCmsRequiredFields = t.type({
  userEmail: EmailString,
  userGroups: t.array(NonEmptyString),
  userId: NonEmptyString,
  subscriptionId: NonEmptyString
});
type ServicesCmsRequiredFields = t.TypeOf<typeof ServicesCmsRequiredFields>;

const ServicesCmsHeader = t.type({
  "x-user-email": EmailString,
  "x-user-groups": NonEmptyString,
  "x-user-id": NonEmptyString,
  "x-subscription-id": NonEmptyString
});
type ServicesCmsHeader = t.TypeOf<typeof ServicesCmsHeader>;

const ServiceLifecycle = t.type({
  fsm: t.type({
    state: t.union([t.literal("approved"), NonEmptyString])
  })
});
type ServiceLifecycle = t.TypeOf<typeof ServiceLifecycle>;

const ServicePublication = t.type({
  fsm: t.type({
    state: t.union([t.literal("published"), NonEmptyString])
  })
});
type ServicePublication = t.TypeOf<typeof ServicePublication>;

// Function to make a GET request with custom headers and validate the response
const fetchServicesCms = async <T>(
  url: string,
  headers: ServicesCmsHeader,
  decoder: t.Type<T, unknown, unknown>
) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    }
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
    throw new Error(`Request failed with status ${response.status}`);
  }
};

export const getCmsRestClient = (baseUrl: NonEmptyString) => ({
  getServicePublication: (
    serviceId: NonEmptyString,
    params: ServicesCmsRequiredFields
  ): Promise<O.Option<ServicePublication>> =>
    fetchServicesCms(
      `${baseUrl}/services/${serviceId}/release`,
      fnCmsHeaderProducer(params),
      ServicePublication
    ),
  getServiceLifecycle: (
    serviceId: NonEmptyString,
    params: ServicesCmsRequiredFields
  ): Promise<O.Option<ServiceLifecycle>> =>
    fetchServicesCms(
      `${baseUrl}/services/${serviceId}`,
      fnCmsHeaderProducer(params),
      ServiceLifecycle
    )
});

const fnCmsHeaderProducer = (
  params: ServicesCmsRequiredFields
): ServicesCmsHeader => ({
  "x-user-email": params.userEmail,
  "x-user-groups": params.userGroups.join(",") as NonEmptyString,
  "x-user-id": params.userId,
  "x-subscription-id": params.subscriptionId
});

export type CmsRestClient = ReturnType<typeof getCmsRestClient>;
