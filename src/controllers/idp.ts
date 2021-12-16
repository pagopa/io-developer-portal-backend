import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import * as t from "io-ts";
import {
  IResponsePermanentRedirect,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import { UrlFromString } from "italia-ts-commons/lib/url";
import { SelfCareIdentity } from "../auth-strategies/selfcare_identity_strategy";
import { createSessionToken } from "../auth-strategies/selfcare_session_strategy";
import { selfcareSessionCreds } from "../config";
import { logger } from "../logger";

const withToken = (url: ValidUrl, idToken: string): ValidUrl => {
  const newUrl = `${url.href}#id_token=${idToken}`;
  return UrlFromString.decode(newUrl).getOrElseL(() => {
    throw new Error(`Cannot parse url: ${newUrl}`);
  });
};

export async function resolveSelfCareIdentity(
  selfcareIdentity: SelfCareIdentity
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
