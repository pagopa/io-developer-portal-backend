import { withDefault } from "@pagopa/ts-commons/lib/types";
import { fromNullable } from "fp-ts/lib/Option";
import * as t from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";

import { EmailAddress } from "../generated/api/EmailAddress";
import { BooleanFromString } from "./utils/booleans";
import { CommaSeparatedListOf } from "./utils/comma-separated-list";

/**
 * Globals and OAuth configuration for the Active Directory B2C tenant / application.
 */
export const azureAdCreds = {
  // Required. It must be tenant-specific endpoint, common endpoint
  // is not supported to use B2C feature.
  identityMetadata: `https://${process.env.TENANT_NAME}.b2clogin.com/${process.env.TENANT_NAME}.onmicrosoft.com/v2.0/.well-known/openid-configuration`,

  // Required, the client ID of your app in AAD
  clientID: process.env.CLIENT_ID as string,

  // Required, must be 'code', 'code id_token', 'id_token code' or 'id_token'
  // If you want to get access_token, you must be 'code', 'code id_token' or 'id_token code'
  responseType: "code id_token",

  // Required
  responseMode: "form_post",

  // Required, the reply URL registered in AAD for your app
  redirectUrl: process.env.REPLY_URL as string,

  // Required if we use http for redirectUrl
  allowHttpForRedirectUrl: true,

  // Required if `responseType` is 'code', 'id_token code' or 'code id_token'.
  // If app key contains '\', replace it with '\\'.
  clientSecret: process.env.CLIENT_SECRET as string,

  // Required, must be true for B2C
  isB2C: true,

  // Required to set to false if you don't want to validate issuer
  validateIssuer: true,

  // Required if you want to provide the issuer(s) you want to validate instead of using the issuer from metadata
  issuer: undefined,

  // Required to set to true if the `verify` function has 'req' as the first parameter
  passReqToCallback: true,

  // Recommended to set to true. By default we save state in express session, if this option is set to true, then
  // we encrypt state and save it in cookie instead. This option together with { session: false } allows your app
  // to be completely express session free.
  useCookieInsteadOfSession: true,

  // Required if `useCookieInsteadOfSession` is set to true. You can provide multiple set of key/iv pairs for key
  // rollover purpose. We always use the first set of key/iv pair to encrypt cookie, but we will try every set of
  // key/iv pair to decrypt cookie. Key can be any string of length 32, and iv can be any string of length 12.
  cookieEncryptionKeys: [
    { key: process.env.COOKIE_KEY, iv: process.env.COOKIE_IV }
  ],

  // Optional. The additional scope you want besides 'openid'
  // (1) if you want refresh_token, use 'offline_access'
  // (2) if you want access_token, use the clientID
  // scope: ["offline_access"],
  scope: ["user_impersonation"],

  // Optional, 'error', 'warn' or 'info'
  loggingLevel: "error",

  // Optional. The lifetime of nonce in session or cookie, the default value is 3600 (seconds).
  nonceLifetime: undefined,

  // Optional. The max amount of nonce saved in session or cookie, the default value is 10.
  nonceMaxAmount: 5,

  // Optional. The clock skew allowed in token validation, the default value is 300 seconds.
  clockSkew: undefined,

  policyName: process.env.POLICY_NAME
};

export const selfcareSessionCreds = {
  // to match session jwt aud
  audience: process.env.BACKEND_URL,
  // page we redirect to when a login fails fo whatever reason
  failureLoginPage: process.env.FAILURE_URL,
  // to match session jwt iss
  issuer: process.env.BACKEND_URL,
  // url to redirect to login
  login_url: process.env.SELFCARE_LOGIN_URL || "",
  // to check jwt signature
  secret: process.env.JWT_SIGNATURE_KEY,
  // page we redirect to after a successful login
  successLoginPage: process.env.LOGIN_URL
};

// To evaluate IdentityToken coming from SelfCare
export const selfcareIdentityCreds = {
  // to match session jwt aud
  audience: process.env.BACKEND_URL,
  // to match session jwt iss
  issuer: process.env.SELFCARE_IDP_ISSUER,
  // url to fetch jwks from
  jwksUrl: process.env.SELFCARE_JWKS_URL
};

export const policyName = process.env.POLICY_NAME;
export const resetPasswordPolicyName = process.env.RESET_PASSWORD_POLICY_NAME;
export const tenantName = process.env.TENANT_NAME;
export const clientName = process.env.CLIENT_NAME;

// The url you need to go to destroy the session with AAD,
// replace <tenant_name> with your tenant name, and
// replace <signin_policy_name> with your signin policy name.
export const destroySessionUrl = `https://${process.env.TENANT_NAME}.b2clogin.com/${process.env.TENANT_NAME}.onmicrosoft.com/oauth2/v2.0/logout?p=${process.env.POLICY_NAME}&post_logout_redirect_uri=${process.env.POST_LOGOUT_URL}`;

export const apimUrl = process.env.POST_LOGIN_URL as string;

export const azurermResourceGroup = process.env.ARM_RESOURCE_GROUP as string;
export const azurermApim = process.env.ARM_APIM as string;

export const apimProductName = process.env.APIM_PRODUCT_NAME as string;
export const apimUserGroups = process.env.APIM_USER_GROUPS as string;

export const adminApiUrl = process.env.ADMIN_API_URL as string;
export const adminApiKey = process.env.ADMIN_API_KEY as string;

export const subscriptionId = process.env.ARM_SUBSCRIPTION_ID as string;

export const logLevel = process.env.LOG_LEVEL as string;
export const port = process.env.PORT;

export const useServicePrincipal = process.env.USE_SERVICE_PRINCIPAL as string;
export const servicePrincipalClientId = process.env
  .SERVICE_PRINCIPAL_CLIENT_ID as string;
export const servicePrincipalSecret = process.env
  .SERVICE_PRINCIPAL_SECRET as string;
export const servicePrincipalTenantId = process.env
  .SERVICE_PRINCIPAL_TENANT_ID as string;

export const sandboxFiscalCode = process.env.SANDBOX_FISCAL_CODE as FiscalCode;

export const logoUrl = process.env.LOGO_URL;

export const IJIRA_CONFIG = t.interface({
  JIRA_BOARD: NonEmptyString,
  JIRA_DELEGATE_ID_FIELD: NonEmptyString,
  JIRA_EMAIL_ID_FIELD: NonEmptyString,
  JIRA_NAMESPACE_URL: NonEmptyString,
  JIRA_ORGANIZATION_ID_FIELD: NonEmptyString,
  JIRA_STATUS_COMPLETE: NonEmptyString,
  JIRA_STATUS_IN_PROGRESS: NonEmptyString,
  JIRA_STATUS_NEW: NonEmptyString,
  JIRA_STATUS_REJECTED: NonEmptyString,
  JIRA_TOKEN: NonEmptyString,
  JIRA_TRANSITION_REJECT_ID: NonEmptyString,
  JIRA_TRANSITION_START_ID: NonEmptyString,
  JIRA_TRANSITION_UPDATED_ID: NonEmptyString,
  JIRA_USERNAME: EmailAddress
});
export type IJIRA_CONFIG = t.TypeOf<typeof IJIRA_CONFIG>;

export const getJiraConfigOrThrow = () =>
  IJIRA_CONFIG.decode({
    ...process.env,
    JIRA_DELEGATE_ID_FIELD: fromNullable(
      process.env.JIRA_DELEGATE_ID_FIELD
    ).getOrElse(""),
    JIRA_EMAIL_ID_FIELD: fromNullable(
      process.env.JIRA_EMAIL_ID_FIELD
    ).getOrElse(""),
    JIRA_ORGANIZATION_ID_FIELD: fromNullable(
      process.env.JIRA_ORGANIZATION_ID_FIELD
    ).getOrElse(""),
    JIRA_STATUS_COMPLETE: fromNullable(
      process.env.JIRA_STATUS_COMPLETE
    ).getOrElse("DONE"),
    JIRA_STATUS_IN_PROGRESS: fromNullable(
      process.env.JIRA_STATUS_IN_PROGRESS
    ).getOrElse("REVIEW"),
    JIRA_STATUS_NEW: fromNullable(process.env.JIRA_STATUS_NEW).getOrElse("NEW"),
    JIRA_STATUS_REJECTED: fromNullable(
      process.env.JIRA_STATUS_REJECTED
    ).getOrElse("REJECTED"),
    JIRA_TRANSITION_REJECT_ID: fromNullable(
      process.env.JIRA_TRANSITION_REJECT_ID
    ).getOrElse("31"),
    JIRA_TRANSITION_START_ID: fromNullable(
      process.env.JIRA_TRANSITION_START_ID
    ).getOrElse("21"),
    JIRA_TRANSITION_UPDATED_ID: fromNullable(
      process.env.JIRA_TRANSITION_UPDATED_ID
    ).getOrElse("11")
  }).getOrElseL(err => {
    throw new Error(errorsToReadableMessages(err).join("|"));
  });

export const IREQUEST_REVIEW_LEGACY_QUEUE_CONFIG = t.interface({
  REQUEST_REVIEW_LEGACY_QUEUE_CONNECTIONSTRING: NonEmptyString,
  REQUEST_REVIEW_LEGACY_QUEUE_NAME: NonEmptyString
});
export type IREQUEST_REVIEW_LEGACY_QUEUE_CONFIG = t.TypeOf<
  typeof IREQUEST_REVIEW_LEGACY_QUEUE_CONFIG
>;

export const getRequestReviewLegacyQueueConfigOrThrow = () =>
  IREQUEST_REVIEW_LEGACY_QUEUE_CONFIG.decode({
    ...process.env,
    REQUEST_REVIEW_LEGACY_QUEUE_CONNECTIONSTRING:
      process.env.REQUEST_REVIEW_LEGACY_QUEUE_CONNECTIONSTRING,
    REQUEST_REVIEW_LEGACY_QUEUE_NAME:
      process.env.REQUEST_REVIEW_LEGACY_QUEUE_NAME
  }).getOrElseL(err => {
    throw new Error(errorsToReadableMessages(err).join("|"));
  });

// which Identity provider this instance is configured to work with
export const IDP = withDefault(
  t.union([t.literal("azure-ad"), t.literal("selfcare")]),
  "azure-ad" as const
)
  .decode(process.env.IDP)
  .getOrElseL(_ => {
    throw new Error(`Invalid IDP configured: ${process.env.IDP}`);
  });

/**
 * References to the subscription migrations service
 */
export const SUBSCRIPTION_MIGRATIONS_URL: string =
  process.env.SUBSCRIPTION_MIGRATIONS_URL || "";
export const SUBSCRIPTION_MIGRATIONS_APIKEY: string =
  process.env.SUBSCRIPTION_MIGRATIONS_APIKEY || "";

/**
 * References to the organization services
 */
export const SERVICE_DATA_URL: string = process.env.SERVICE_DATA_URL || "";
// Azure Function Auth API KEY
export const SERVICE_DATA_APIKEY: string =
  process.env.SERVICE_DATA_APIKEY || "";

/**
 * Feature Flags
 */
/**
 * We have a feature (manage key) that we don't enable for users EXCEPT the ones in an enabling list.
 * The enabling list is a list of strings that represents a user id.
 * If one of such strings is "*", we suddenly open the feature to everyone.
 */
export const manageFlowEnableUserList = withDefault(
  CommaSeparatedListOf(NonEmptyString),
  [] as ReadonlyArray<string>
)
  .decode(process.env.MANAGE_FLOW_ENABLE_USER_LIST)
  .getOrElseL(_ => {
    throw new Error(
      `Invalid Manage Flow enable user list configured: ${process.env.MANAGE_FLOW_ENABLE_USER_LIST}`
    );
  });

/**
 * Lock the creation of a new APIM user, when resolve SelfCareIdentity.
 */
export const lockSelfcareCreateNewApimUser = withDefault(
  BooleanFromString,
  ("false" as unknown) as boolean
)
  .decode(process.env.LOCK_SELFCARE_CREATE_NEW_APIM_USER)
  .getOrElseL(_ => {
    throw new Error(
      `Invalid lockSelfcareCreateNewApimUser configured: ${process.env.LOCK_SELFCARE_CREATE_NEW_APIM_USER}`
    );
  });

export const ServicesCmsConfig = t.type({
  API_SERVICES_CMS_BASE_PATH: NonEmptyString,
  API_SERVICES_CMS_URL: NonEmptyString
});
export type ServicesCmsConfig = t.TypeOf<typeof ServicesCmsConfig>;

export const getServicesCmsConfigOrThrow = () =>
  ServicesCmsConfig.decode({
    ...process.env, // TODO: remove if useless
    API_SERVICES_CMS_BASE_PATH: process.env.API_SERVICES_CMS_BASE_PATH,
    API_SERVICES_CMS_URL: process.env.API_SERVICES_CMS_URL
  }).getOrElseL(err => {
    throw new Error(errorsToReadableMessages(err).join("|"));
  });
