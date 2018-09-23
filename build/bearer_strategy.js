"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const t = require("io-ts");
const logger_1 = require("./logger");
const strings_1 = require("italia-ts-commons/lib/strings");
const passport_azure_ad_1 = require("passport-azure-ad");
/**
 * Format of the Active directory B2C user data.
 * See the ADB2C tenant configuration for custom attributes (extensions).
 */
exports.AdUser = t.interface({
    emails: t.array(strings_1.EmailString),
    extension_Department: t.string,
    extension_Organization: t.string,
    extension_Service: t.string,
    family_name: t.string,
    given_name: t.string,
    oid: strings_1.NonEmptyString
});
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
exports.setupBearerStrategy = (passportInstance, 
// tslint:disable-next-line:no-any
creds, cb) => {
    passportInstance.use("oauth-bearer", new passport_azure_ad_1.BearerStrategy(creds, (_, profile, done) => {
        return cb(profile.oid, profile)
            .then(() => {
            logger_1.logger.debug("user authenticated %s", JSON.stringify(profile));
            return done(undefined, profile);
        })
            .catch(e => {
            logger_1.logger.error("error during authentication %s", JSON.stringify(e));
            return done(e);
        });
    }));
};
//# sourceMappingURL=bearer_strategy.js.map