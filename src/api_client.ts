/**
 * REST client for Notification / Preference APIs.
 * See spec here: https://pagopa.github.io/io/api/public.html
 */

import * as t from "io-ts";

// A basic response type that also include 401
import { Either, left, right } from "fp-ts/lib/Either";

import {
  ApiHeaderJson,
  basicErrorResponseDecoder,
  basicResponseDecoder,
  BasicResponseType,
  composeHeaderProducers,
  composeResponseDecoders,
  createFetchRequestForApi,
  IGetApiRequestType,
  ioResponseDecoder,
  IPostApiRequestType,
  IPutApiRequestType,
  IResponseType,
  RequestHeaderProducer,
  ResponseDecoder,
  TypeofApiCall
} from "italia-ts-commons/lib/requests";

import { NonEmptyString } from "italia-ts-commons/lib/strings";
import nodeFetch from "node-fetch";
import { DevelopmentProfile } from "../generated/api/DevelopmentProfile";
import { ExtendedProfile } from "../generated/api/ExtendedProfile";
import { FiscalCode } from "../generated/api/FiscalCode";
import { LimitedProfile } from "../generated/api/LimitedProfile";
import { NewMessage } from "../generated/api/NewMessage";
import { Service } from "../generated/api/Service";
import { ServicePublic } from "../generated/api/ServicePublic";

import { CIDRsPayload } from "../generated/api/CIDRsPayload";
import { Logo } from "../generated/api/Logo";

const OcpApimSubscriptionKey = "Ocp-Apim-Subscription-Key";
type OcpApimSubscriptionKey = typeof OcpApimSubscriptionKey;

// ProfileLimitedOrExtended is oneOf [LimitedProfile, ExtendedProfile]
const ProfileLimitedOrExtended = t.union([LimitedProfile, ExtendedProfile]);

export type ProfileLimitedOrExtended = t.TypeOf<
  typeof ProfileLimitedOrExtended
>;

export type ApiResponseType<R> =
  | BasicResponseType<R>
  | IResponseType<201, R>
  | IResponseType<401, Error>;

export function apiResponseDecoder<R, O = R>(
  type: t.Type<R, O>
): ResponseDecoder<ApiResponseType<R>> {
  const basicResponseDecoderWith401 = composeResponseDecoders(
    basicResponseDecoder(type),
    basicErrorResponseDecoder(401)
  );
  return composeResponseDecoders(
    ioResponseDecoder(201, type),
    basicResponseDecoderWith401
  );
}

export function SubscriptionKeyHeaderProducer<P>(
  token: string
): RequestHeaderProducer<P, OcpApimSubscriptionKey> {
  return () => ({
    [OcpApimSubscriptionKey]: token
  });
}

export type GetServiceT = IGetApiRequestType<
  {
    readonly id: string;
  },
  OcpApimSubscriptionKey,
  never,
  ApiResponseType<Service>
>;

export type SendMessageT = IPostApiRequestType<
  {
    readonly message: NewMessage;
    readonly fiscalCode: FiscalCode;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<{ readonly id: NonEmptyString }>
>;

export type CreateDevelopmentProfileT = IPostApiRequestType<
  {
    readonly fiscalCode: FiscalCode;
    readonly newProfile: DevelopmentProfile;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<ExtendedProfile>
>;

export type CreateServiceT = IPostApiRequestType<
  {
    readonly service: Service;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<ServicePublic>
>;

export type UpdateServiceT = IPutApiRequestType<
  {
    readonly service: Service;
    readonly serviceId: string;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<ServicePublic>
>;

export type UploadServiceLogoT = IPutApiRequestType<
  {
    readonly logo: Logo;
    readonly serviceId: string;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<{}>
>;

export type UploadOrganizationLogoT = IPutApiRequestType<
  {
    readonly logo: Logo;
    readonly organizationfiscalcode: string;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<{}>
>;

export type GetSubscriptionCIDRsT = IGetApiRequestType<
  {
    readonly subscriptionId: NonEmptyString;
  },
  OcpApimSubscriptionKey,
  never,
  ApiResponseType<CIDRsPayload>
>;

export type UpdateSubscriptionCIDRsT = IPutApiRequestType<
  {
    readonly cidrs: CIDRsPayload;
    readonly subscriptionId: NonEmptyString;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  ApiResponseType<CIDRsPayload>
>;

export function APIClient(
  baseUrl: string,
  token: string,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): {
  readonly createDevelopmentProfile: TypeofApiCall<CreateDevelopmentProfileT>;
  readonly createService: TypeofApiCall<CreateServiceT>;
  readonly updateService: TypeofApiCall<UpdateServiceT>;
  readonly getService: TypeofApiCall<GetServiceT>;
  readonly sendMessage: TypeofApiCall<SendMessageT>;
  readonly uploadServiceLogo: TypeofApiCall<UploadServiceLogoT>;
  readonly uploadOrganizationLogo: TypeofApiCall<UploadOrganizationLogoT>;
  readonly getSubscriptionCidrs: TypeofApiCall<GetSubscriptionCIDRsT>;
  readonly updateSubscriptionCidrs: TypeofApiCall<UpdateSubscriptionCIDRsT>;
} {
  const options = {
    baseUrl,
    fetchApi
  };

  const tokenHeaderProducer = SubscriptionKeyHeaderProducer(token);

  const getServiceT: GetServiceT = {
    headers: tokenHeaderProducer,
    method: "get",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(Service),
    url: params => `/adm/services/${params.id}`
  };

  const sendMessageT: SendMessageT = {
    body: params => JSON.stringify(params.message),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(t.interface({ id: NonEmptyString })),
    url: params => `/api/v1/messages/${params.fiscalCode}`
  };

  const createDevelopmentProfileT: CreateDevelopmentProfileT = {
    body: params => JSON.stringify(params.newProfile),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(ExtendedProfile),
    url: params => `/adm/development-profiles/${params.fiscalCode}`
  };

  const createServiceT: CreateServiceT = {
    body: params => JSON.stringify(params.service),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(ServicePublic),
    url: _ => `/adm/services`
  };

  const updateServiceT: UpdateServiceT = {
    body: params => JSON.stringify(params.service),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "put",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(ServicePublic),
    url: params => `/adm/services/${params.serviceId}`
  };

  const uploadServiceLogoT: UploadServiceLogoT = {
    body: params => JSON.stringify(params.logo),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "put",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(t.type({})),
    url: params => `/adm/services/${params.serviceId}/logo`
  };

  const uploadOrganizationLogoT: UploadOrganizationLogoT = {
    body: params => JSON.stringify(params.logo),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "put",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(t.type({})),
    url: params => `/adm/organizations/${params.organizationfiscalcode}/logo`
  };

  const getSubscriptionCIDRsT: GetSubscriptionCIDRsT = {
    headers: tokenHeaderProducer,
    method: "get",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(CIDRsPayload),
    url: params => `/adm/subscriptions/${params.subscriptionId}/cidrs`
  };

  const updateSubscriptionCIDRsT: UpdateSubscriptionCIDRsT = {
    body: params => JSON.stringify(params.cidrs),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "put",
    query: _ => ({}),
    response_decoder: apiResponseDecoder(CIDRsPayload),
    url: params => `/adm/subscriptions/${params.subscriptionId}/cidrs`
  };

  return {
    createDevelopmentProfile: createFetchRequestForApi(
      createDevelopmentProfileT,
      options
    ),
    createService: createFetchRequestForApi(createServiceT, options),
    getService: createFetchRequestForApi(getServiceT, options),
    getSubscriptionCidrs: createFetchRequestForApi(
      getSubscriptionCIDRsT,
      options
    ),
    sendMessage: createFetchRequestForApi(sendMessageT, options),
    updateService: createFetchRequestForApi(updateServiceT, options),
    updateSubscriptionCidrs: createFetchRequestForApi(
      updateSubscriptionCIDRsT,
      options
    ),
    uploadOrganizationLogo: createFetchRequestForApi(
      uploadOrganizationLogoT,
      options
    ),
    uploadServiceLogo: createFetchRequestForApi(uploadServiceLogoT, options)
  };
}

export function toEither<T>(
  res: ApiResponseType<T> | undefined
): Either<Error, T> {
  if (!res) {
    return left(new Error("Response is empty"));
  }
  if (res.status === 200 || res.status === 201) {
    return right(res.value);
  } else {
    return left(new Error("Error parsing response: " + res.status));
  }
}

export type APIClient = typeof APIClient;
