import * as passport from "passport";
import * as express from "express";
import { OIDCStrategy } from "passport-azure-ad";

interface IProfile {
  _json: {
    oid: string;
    emails: string[];
    family_name: string;
    given_name: string;
    extension_Organization: string;
  };
}

/******************************************************************************
 * Set up passport in the app 
 ******************************************************************************/

//-----------------------------------------------------------------------------
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
//-----------------------------------------------------------------------------
export const setupOidcStrategy = (
  config: any,
  cb: (subscriptionId: string, profile: IProfile) => Promise<void>
) => {
  passport.use(
    "azuread-openidconnect",
    new OIDCStrategy(config.creds, function(
      req: express.Request,
      _: string,
      sub: string,
      profile: IProfile,
      done: (err: Error | undefined, profile?: IProfile) => void
    ) {
      const subscriptionId = (req as any).session.subscriptionId;
      if (!sub) {
        return done(new Error("No user id found"));
      }
      return cb(subscriptionId, profile)
        .then(() => done(undefined, profile))
        .catch(e => done(e));
    })
  );
};
