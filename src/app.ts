"use strict";

import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/../local.env" });

import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import * as methodOverride from "method-override";
import * as passport from "passport";
import * as config from "./local.config";

import * as cookieSession from "cookie-session";

import { createOrUpdateApimUser, IUserData } from "./account";
import { setupOidcStrategy } from "./oidc_strategy";
import { createService } from "./service";

import * as winston from "winston";

winston.configure({
  transports: [
    new winston.transports.Console({ level: process.env.LOG_LEVEL || "info" })
  ]
});

setupOidcStrategy(config.creds, async (userId, profile) => {
  const userData: IUserData = {
    oid: profile._json.oid,
    firstName: profile._json.family_name,
    lastName: profile._json.given_name,
    email: profile._json.emails[0],
    productName: config.apim_product_name,
    groups: config.apim_user_groups.split(",")
  };
  const subscription = await createOrUpdateApimUser(userId, userData);
  if (subscription && subscription.name) {
    await createService({
      authorized_recipients: [],
      department_name: profile._json.extension_Organization,
      organization_name: profile._json.extension_Organization,
      service_id: subscription.name,
      service_name: profile._json.extension_Organization
    });
  }
});

const app = express();

app.use(
  cookieSession({
    name: "session",
    keys: [config.creds.cookieEncryptionKeys[0].key]
  })
);

// app.use(express.logger());
app.use(methodOverride());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());

// -----------------------------------------------------------------------------
// Set up the route controller
//
// 1. For 'login' route and 'returnURL' route, use `passport.authenticate`.
// This way the passport middleware can redirect the user to login page, receive
// id_token etc from returnURL.
//
// 2. For the routes you want to check if user is already logged in, use
// `ensureAuthenticated`. It checks if there is an user stored in session, if not
// it will call `passport.authenticate` to ask for user to log in.
// -----------------------------------------------------------------------------

// function ensureAuthenticated(req, res, next) {
//   if (req.isAuthenticated()) { return next(); }
//   res.redirect('/login');
// };

const verifier = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (req.params.userId) {
    // tslint:disable-next-line
    (req as any).session.userId = req.params.userId;
  }
  passport.authenticate("azuread-openidconnect", {
    session: false,
    failureRedirect: "/login",
    response: res
  } as {})(req, res, next);
};

const callback = (_: string, redirectUrl: string) => (
  __: express.Request,
  res: express.Response
) => {
  res.redirect(redirectUrl);
};

app.get("/login/:userId", verifier, callback("login", config.apim_url));

app.all("/auth/openid/return", verifier, callback("openid", config.apim_url));

app.get("/logout", (req, res) => {
  req.logOut();
  res.redirect(config.destroySessionUrl);
});

// tslint:disable-next-line
console.log(
  "Navigate to http://localhost:3000/login/<userId>?p=" +
    process.env.POLICY_NAME
);

app.listen(3000);
