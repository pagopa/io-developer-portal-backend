/*
 *  OpenID Connect strategy for passport / express.
 */
import * as express from "express";
import * as t from "io-ts";
import * as passport from "passport";
import { logger } from "./logger";

import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import { BearerStrategy } from "passport-azure-ad";

/**
 * Format of the Active directory B2C user data.
 * See the ADB2C tenant configuration for custom attributes (extensions).
 */
export const AdUser = t.interface({
  emails: t.array(EmailString),
  extension_Department: t.string,
  extension_Organization: t.string,
  extension_Service: t.string,
  family_name: t.string,
  given_name: t.string,
  oid: NonEmptyString
});

export type AdUser = t.TypeOf<typeof AdUser>;

// -----------------------------------------------------------------------------
// Use the OIDCStrategy within Passport.
//
// Strategies in passport require a `verify` function, which accepts credentials
// (in this case, the `oid` claim in id_token), and invoke a callback to find
// the corresponding user object.
//
// The following are the accepted prototypes for the `verify` function
// (1) function(iss, sub, done)
// (2) function(iss, sub, profile, done)
// (3) function(iss, sub, profile, access_token, refresh_token, done)
// (4) function(iss, sub, profile, access_token, refresh_token, params, done)
// (5) function(iss, sub, profile, jwtClaims, access_token, refresh_token, params, done)
// (6) prototype (1)-(5) with an additional `req` parameter as the first parameter
//
// To do prototype (6), passReqToCallback must be set to true in the config.
// -----------------------------------------------------------------------------

/**
 * Calls a callback on the logged in user's profile.
 */
export const setupBearerStrategy = (
  passportInstance: typeof passport,
  // tslint:disable-next-line:no-any
  creds: any,
  cb: (userId: string, profile: AdUser) => Promise<void>
) => {
  passportInstance.use(
    "oauth-bearer",
    new BearerStrategy(
      creds,
      (
        _: express.Request,
        profile: AdUser,
        done: (err: Error | undefined, profile?: AdUser) => void
      ) => {
        return cb(profile.oid, profile)
          .then(() => {
            logger.debug("user authenticated %s", JSON.stringify(profile));
            return done(undefined, profile);
          })
          .catch(e => {
            logger.error("error during authentication %s", JSON.stringify(e));
            return done(e);
          });
      }
    )
  );
};
