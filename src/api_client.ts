/**
 * REST client for Notification / Preference APIs.
 * See spec here: https://teamdigitale.github.io/digital-citizenship/api/public.html
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
  IPostApiRequestType,
  IResponseType,
  RequestHeaderProducer,
  ResponseDecoder,
  TypeofApiCall
} from "italia-ts-commons/lib/requests";

import { NonEmptyString } from "italia-ts-commons/lib/strings";
import nodeFetch from "node-fetch";
import { ExtendedProfile } from "./api/ExtendedProfile";
import { FiscalCode } from "./api/FiscalCode";
import { LimitedProfile } from "./api/LimitedProfile";
import { NewMessage } from "./api/NewMessage";
import { Service } from "./api/Service";
import { ServicePublic } from "./api/ServicePublic";

const OcpApimSubscriptionKey = "Ocp-Apim-Subscription-Key";
type OcpApimSubscriptionKey = typeof OcpApimSubscriptionKey;

// ProfileLimitedOrExtended is oneOf [LimitedProfile, ExtendedProfile]
const ProfileLimitedOrExtended = t.union([LimitedProfile, ExtendedProfile]);

export type ProfileLimitedOrExtended = t.TypeOf<
  typeof ProfileLimitedOrExtended
>;

export type BasicResponseTypeWith401<R> =
  | BasicResponseType<R>
  | IResponseType<401, Error>;

// A basic response decoder that also include 401
export function basicResponseDecoderWith401<R, O = R>(
  type: t.Type<R, O>
): ResponseDecoder<BasicResponseTypeWith401<R>> {
  return composeResponseDecoders(
    basicResponseDecoder(type),
    basicErrorResponseDecoder(401)
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
  BasicResponseTypeWith401<Service>
>;

export type SendMessageT = IPostApiRequestType<
  {
    readonly message: NewMessage;
    readonly fiscalCode: FiscalCode;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  BasicResponseTypeWith401<{ readonly id: NonEmptyString }>
>;

export type CreateOrUpdateProfileT = IPostApiRequestType<
  {
    readonly fiscalCode: FiscalCode;
    readonly newProfile: ExtendedProfile;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  BasicResponseTypeWith401<ExtendedProfile>
>;

export type CreateServiceT = IPostApiRequestType<
  {
    readonly service: Service;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  BasicResponseTypeWith401<ServicePublic>
>;

export type UpdateServiceT = IPostApiRequestType<
  {
    readonly service: Service;
    readonly serviceId: string;
  },
  OcpApimSubscriptionKey | "Content-Type",
  never,
  BasicResponseTypeWith401<ServicePublic>
>;

export function APIClient(
  baseUrl: string,
  token: string,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): {
  readonly createOrUpdateProfile: TypeofApiCall<CreateOrUpdateProfileT>;
  readonly createService: TypeofApiCall<CreateServiceT>;
  readonly updateService: TypeofApiCall<UpdateServiceT>;
  readonly getService: TypeofApiCall<GetServiceT>;
  readonly sendMessage: TypeofApiCall<SendMessageT>;
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
    response_decoder: basicResponseDecoderWith401(Service),
    url: params => `/adm/services/${params.id}`
  };

  const sendMessageT: SendMessageT = {
    body: params => JSON.stringify(params.message),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: basicResponseDecoderWith401(
      t.interface({ id: NonEmptyString })
    ),
    url: params => `/api/v1/messages/${params.fiscalCode}`
  };

  const createOrUpdateProfileT: CreateOrUpdateProfileT = {
    body: params => JSON.stringify(params.newProfile),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: basicResponseDecoderWith401(ExtendedProfile),
    url: params => `/api/v1/profiles/${params.fiscalCode}`
  };

  const createServiceT: CreateServiceT = {
    body: params => JSON.stringify(params.service),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: basicResponseDecoderWith401(ServicePublic),
    url: _ => `/adm/services`
  };

  const updateServiceT: UpdateServiceT = {
    body: params => JSON.stringify(params.service),
    headers: composeHeaderProducers(tokenHeaderProducer, ApiHeaderJson),
    method: "post",
    query: _ => ({}),
    response_decoder: basicResponseDecoderWith401(ServicePublic),
    url: params => `/adm/services/${params.serviceId}`
  };

  return {
    createOrUpdateProfile: createFetchRequestForApi(
      createOrUpdateProfileT,
      options
    ),
    createService: createFetchRequestForApi(createServiceT, options),
    getService: createFetchRequestForApi(getServiceT, options),
    sendMessage: createFetchRequestForApi(sendMessageT, options),
    updateService: createFetchRequestForApi(updateServiceT, options)
  };
}

export function toEither<T>(
  res: BasicResponseTypeWith401<T> | undefined
): Either<Error, T> {
  if (!res) {
    return left(new Error("Response is empty"));
  }
  if (res.status === 200) {
    return right(res.value);
  } else {
    return left(new Error("Error parsing response: " + res.status));
  }
}

export type APIClient = typeof APIClient;
