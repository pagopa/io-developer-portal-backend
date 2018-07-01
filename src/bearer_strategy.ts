/*
 *  OpenID Connect strategy for passport / express.
 */

import * as express from "express";
import * as passport from "passport";
import { BearerStrategy } from "passport-azure-ad";

export interface IProfile {
  readonly oid: string;
  readonly emails: ReadonlyArray<string>;
  readonly family_name: string;
  readonly given_name: string;
  readonly extension_Organization: string;
  readonly extension_Department: string;
  readonly extension_Service: string;
}

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
  // tslint:disable-next-line
  creds: any,
  cb: (userId: string, profile: IProfile) => Promise<void>
) => {
  passport.use(
    "oauth-bearer",
    new BearerStrategy(
      creds,
      (
        _: express.Request,
        profile: IProfile,
        done: (err: Error | undefined, profile?: IProfile) => void
      ) => {
        return cb(profile.oid, profile)
          .then(() => done(undefined, profile))
          .catch(e => done(e));
      }
    )
  );
};
