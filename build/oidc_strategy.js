"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const passport = require("passport");
const passport_azure_ad_1 = require("passport-azure-ad");
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
exports.setupOidcStrategy = (config, cb) => {
    passport.use("azuread-openidconnect", new passport_azure_ad_1.OIDCStrategy(config.creds, function (_, sub, profile, done) {
        if (!sub) {
            return done(new Error("No user id found"));
        }
        profile._json.oid = sub;
        return cb(profile)
            .then(() => done(undefined, profile))
            .catch(e => done(e));
    }));
};
//# sourceMappingURL=oidc_strategy.js.map