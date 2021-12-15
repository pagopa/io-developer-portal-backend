import {
  IResponsePermanentRedirect,
  ResponsePermanentRedirect
} from "italia-ts-commons/lib/responses";
import { UrlFromString } from "italia-ts-commons/lib/url";
import { SelfCareIdentity } from "../auth-strategies/selfcare_identity_strategy";
import { createSessionToken } from "../auth-strategies/selfcare_session_strategy";
import { selfcareSessionCreds } from "../config";
import * as t from "io-ts";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

export async function resolveSelfCareIdentity(
  selfcareIdentity: SelfCareIdentity
): Promise<IResponsePermanentRedirect> {
  const options = t
    .interface({
      successLoginPage: UrlFromString,
      failureLoginPage: UrlFromString,
      secret: NonEmptyString
    })
    .decode(selfcareSessionCreds)
    .getOrElseL(() => {
      throw new Error("Invalid configuration env file");
    });

  try {
    const _ = await createSessionToken(selfcareIdentity, {
      signatureKey: options.secret
    });
    return ResponsePermanentRedirect(options.successLoginPage);
  } catch (error) {
    return ResponsePermanentRedirect(options.failureLoginPage);
  }
}
