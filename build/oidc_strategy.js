"use strict";
/*
 *  OpenID Connect strategy for passport / express.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const passport = require("passport");
const passport_azure_ad_1 = require("passport-azure-ad");
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
exports.setupOidcStrategy = (
// tslint:disable-next-line
creds, cb) => {
    passport.use("azuread-openidconnect", new passport_azure_ad_1.OIDCStrategy(creds, (req, _, sub, profile, done) => {
        // tslint:disable-next-line
        const userId = req.session.userId;
        if (!sub) {
            return done(new Error("No user id found"));
        }
        return cb(userId, profile)
            .then(() => done(undefined, profile))
            .catch(e => done(e));
    }));
};
//# sourceMappingURL=oidc_strategy.js.map