/**
 * Utilities to handle session objects
 */

import * as t from "io-ts";
import { EmailAddress } from "../../generated/api/EmailAddress";
import { formatApimAccountEmailForSelfcareOrganization } from "../apim_operations";
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
export const getApimAccountEmail = (user: SessionUser): EmailAddress =>
  AdUser.is(user)
    ? // Azure AD users have a set of emails, we consider the first to uniquely bind the user to an APIM account
      EmailAddress.decode(user.emails[0]).getOrElseL(() => {
        throw new Error(`Cannot get APIM account email`);
      })
    : // SelfCare users bind to Organization's APIM account, thus we use a synthetic email address
      formatApimAccountEmailForSelfcareOrganization(user.organization);
