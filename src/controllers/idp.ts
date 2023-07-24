import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import ApiManagementClient from "azure-arm-apimanagement";
import { isNone } from "fp-ts/lib/Option";
import * as t from "io-ts";
import {
  IResponsePermanentRedirect,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import { UrlFromString } from "italia-ts-commons/lib/url";
import {
  apimUserForSelfCareOrganization,
  createApimUserIfNotExists
} from "../apim_operations";
import { SelfCareIdentity } from "../auth-strategies/selfcare_identity_strategy";
import { createSessionToken } from "../auth-strategies/selfcare_session_strategy";
import { selfcareSessionCreds } from "../config";
import * as config from "../config";
import { logger } from "../logger";

const withToken = (url: ValidUrl, idToken: string): ValidUrl => {
  const newUrl = `${url.href}#id_token=${idToken}`;
  return UrlFromString.decode(newUrl).getOrElseL(() => {
    throw new Error(`Cannot parse url: ${newUrl}`);
  });
};

export async function resolveSelfCareIdentity(
  selfcareIdentity: SelfCareIdentity,
  apimClient: ApiManagementClient
): Promise<IResponsePermanentRedirect> {
  const options = t
    .interface({
      audience: NonEmptyString,
      failureLoginPage: UrlFromString,
      issuer: NonEmptyString,
      secret: NonEmptyString,
      successLoginPage: UrlFromString
    })
    .decode(selfcareSessionCreds)
    .getOrElseL(err => {
      logger.error(`Invalid configuration env file: ${readableReport(err)}`);
      throw new Error("Invalid configuration env file");
    });

  try {
    // ensure an apim account is created for every session,
    // so that every user operation can rely on that
    const maybeApimUser = await createApimUserIfNotExists(
      apimClient,
      apimUserForSelfCareOrganization(selfcareIdentity.organization)
    );

    // feature flag to lock new Selfcare users access
    if (config.lockSelfcareCreateNewApimUser && isNone(maybeApimUser)) {
      return ResponsePermanentRedirect(options.failureLoginPage);
    }

    const token = createSessionToken(selfcareIdentity, {
      audience: options.audience,
      issuer: options.issuer,
      signatureKey: options.secret
    });
    return ResponsePermanentRedirect(
      withToken(options.successLoginPage, token)
    );
  } catch (error) {
    return ResponsePermanentRedirect(options.failureLoginPage);
  }
}
