/**
 * Utilities to handle session objects
 */

import * as t from "io-ts";
import { EmailAddress } from "../../generated/api/EmailAddress";
import { AdUser } from "../auth-strategies/azure_ad_strategy";

/**
 * Abstract shape for user data stored in session
 */
export type SessionUser = t.TypeOf<typeof SessionUser>;
export const SessionUser = AdUser;

/**
 * Lens that extracts the email address for Session user to bind to an APIM account
 *
 * @param user
 * @returns
 */
export const getApimAccountEmail = (user: SessionUser): EmailAddress => {
  return user.emails[0];
};
