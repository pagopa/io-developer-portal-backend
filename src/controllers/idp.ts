import { ApiManagementClient } from "@azure/arm-apimanagement";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import { isNone } from "fp-ts/lib/Option";
import * as t from "io-ts";
import {
  IResponsePermanentRedirect,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import { UrlFromString } from "italia-ts-commons/lib/url";
import {
  apimUserForSelfCareOrganization,
  createApimUserIfNotExists,
  formatApimAccountEmailForSelfcareOrganization,
  getApimUser
} from "../apim_operations";
import { SelfCareIdentity } from "../auth-strategies/selfcare_identity_strategy";
import { createSessionToken } from "../auth-strategies/selfcare_session_strategy";
import { lockSelfcareCreateNewApimUser, selfcareSessionCreds } from "../config";
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
    // Ensure an APIM account exists for every session,
    // so that every user operation can rely on that.
    // If account creation is allowed for the first usage, the account is either fetcher or created
    // In such a case, the login fails when account creation fails.
    // Otherwise the account is fetched and the login fails when the account is not found
    const maybeApimUser = lockSelfcareCreateNewApimUser
      ? await getApimUser(
          apimClient,
          formatApimAccountEmailForSelfcareOrganization(
            selfcareIdentity.organization
          )
        )
      : await createApimUserIfNotExists(
          apimClient,
          apimUserForSelfCareOrganization(selfcareIdentity.organization)
        );
    // block access if Apim user is not returned
    if (isNone(maybeApimUser)) {
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
