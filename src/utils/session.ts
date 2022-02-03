/**
 * Utilities to handle session objects
 */

import * as t from "io-ts";
import { EmailAddress } from "../../generated/api/EmailAddress";
import { AdUser } from "../auth-strategies/azure_ad_strategy";
import { SelfCareUser } from "../auth-strategies/selfcare_session_strategy";

/**
 * Abstract shape for user data stored in session
 */
export type SessionUser = t.TypeOf<typeof SessionUser>;
export const SessionUser = t.union([AdUser, SelfCareUser]);

/**
 * Lens that extracts the email address for Session user to bind to an APIM account
 *
 * @param user
 * @returns
 */
export const getApimAccountEmail = (user: SessionUser): EmailAddress => {
  const email = AdUser.is(user)
    ? // Azure AD users have a set of emails, we consider the first to uniquely bind the user to an APIM account
      user.emails[0]
    : // SelfCare users bind to Organization's APIM account, thus we use a synthetic email address
      `org.${user.organization.id}@selfcare.io.pagopa.it`;

  return EmailAddress.decode(email).getOrElseL(() => {
    throw new Error(`Cannot get APIM account email`);
  });
};

/**
 * Lens that composes the annotation to be stored on APIM accont, depending on the session user type
 *
 * @param user
 * @returns
 */
export const getApimAccountAnnotation = (user: SessionUser): string =>
  SelfCareUser.is(user)
    ? // for SelfCare we store Organization's info in notes
      user.organization.fiscal_code
    : "";
