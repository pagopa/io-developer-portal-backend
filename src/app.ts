"use strict";

import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/../local.env" });

import * as express from "express";
import * as cookieParser from "cookie-parser";
import * as bodyParser from "body-parser";
import * as methodOverride from "method-override";
import * as passport from "passport";
import * as config from "./local.config";

import {createOrUpdateApimUser, IUserData} from "./account";

import { setupOidcStrategy } from "./oidc_strategy";

setupOidcStrategy(config, (profile) => {
  const userData: IUserData = {
    uid: profile._json.oid,
    firstName: profile._json.family_name,
    lastName: profile._json.given_name,
    email: profile._json.emails[0],
    productName: config.apim_product_name,
    groups: config.apim_user_groups.split(",")
  }
  console.log("profile", profile);
  console.log("creating", userData);
  return createOrUpdateApimUser(userData);
});

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

const verifier = function(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  passport.authenticate("azuread-openidconnect", {
    session: false,
    failureRedirect: "/",
    response: res
  } as any)(req, res, next);
};

const callback = function(method: string, redirectUrl: string) {
  return function(req: express.Request, res: express.Response) {
    console.log(
      method + " was called with authenticated state = ",
      req.isAuthenticated()
    );
    res.redirect(redirectUrl);
  };
};

app.get("/", callback("index", config.apim_url));
app.get("/login", verifier, callback("login", config.apim_url));
app.get(
  "/auth/openid/return",
  verifier,
  callback("openid-get", config.apim_url)
);
app.post(
  "/auth/openid/return",
  verifier,
  callback("openid-post", config.apim_url)
);

app.get("/logout", function(req, res) {
  req.logOut();
  res.redirect(config.destroySessionUrl);
});

console.log(
  "Navigate to http://localhost:3000/login/?p=" + process.env.POLICY_NAME
);

app.listen(3000);
