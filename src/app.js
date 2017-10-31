"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
dotenv.config({ path: "local.env" });
const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");
const passport = require("passport");
const config = require("./local.config");
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
passport.use("azuread-openidconnect", new passport_azure_ad_1.OIDCStrategy(config.creds, function (_, sub, profile, done) {
    console.log("profile", profile);
    if (!sub) {
        return done(new Error("No user id found"));
    }
    profile.oid = sub;
    return done(undefined, profile);
}));
//-----------------------------------------------------------------------------
// Config the app, include middlewares
//-----------------------------------------------------------------------------
const app = express();
// app.use(express.logger());
app.use(methodOverride());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
//-----------------------------------------------------------------------------
// Set up the route controller
//
// 1. For 'login' route and 'returnURL' route, use `passport.authenticate`.
// This way the passport middleware can redirect the user to login page, receive
// id_token etc from returnURL.
//
// 2. For the routes you want to check if user is already logged in, use
// `ensureAuthenticated`. It checks if there is an user stored in session, if not
// it will call `passport.authenticate` to ask for user to log in.
//-----------------------------------------------------------------------------
// function ensureAuthenticated(req, res, next) {
//   if (req.isAuthenticated()) { return next(); }
//   res.redirect('/login');
// };
const verifier = function (req, res, next) {
    passport.authenticate("azuread-openidconnect", {
        session: false,
        failureRedirect: "/"
    })(req, res, next);
};
const callback = function (method, redirectUrl) {
    return function (req, res) {
        console.log(method + " was called with authenticated state = ", req.isAuthenticated());
        res.redirect(redirectUrl);
    };
};
app.get("/", callback("index", config.apim_url));
app.get("/login", verifier, callback("login", config.apim_url));
app.get("/auth/openid/return", verifier, callback("openid-get", config.apim_url));
app.post("/auth/openid/return", verifier, callback("openid-post", config.apim_url));
app.get("/logout", function (req, res) {
    req.logOut();
    res.redirect(config.destroySessionUrl);
});
console.log("Navigate to http://localhost:3000/login/?p=" + process.env.POLICY_NAME);
app.listen(3000);
//# sourceMappingURL=app.js.map