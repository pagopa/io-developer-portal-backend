/**
 * The aim of this Express Web application is to automate
 * some tasks related to users management in the Digital Citizenship
 * Azure API management developer portal resource.
 *
 * The flow starts when the user, already logged into the developoer portal,
 * clicks on a call-to-action that links to the '/login/<userId>' endpoint.
 */

import * as dotenv from "dotenv";
/*
 * Useful for testing the web application locally.
 * 'local.env' file does not need to exists in the
 * production environment (use Application Settings instead)
 */
dotenv.config({ path: __dirname + "/../local.env" });

import * as appinsights from "applicationinsights";
import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import * as methodOverride from "method-override";
import * as passport from "passport";
import * as config from "./config";

import * as cookieSession from "cookie-session";

import * as msRestAzure from "ms-rest-azure";

import { IUserData, updateApimUser } from "./account";
import { secureExpressApp } from "./express";
import { createFakeProfile } from "./fake_profile";
import { sendMessage } from "./message";
import { setupOidcStrategy } from "./oidc_strategy";
import { createService } from "./service";

const telemetryClient = new appinsights.TelemetryClient();

import * as winston from "winston";

winston.configure({
  transports: [
    new winston.transports.Console({ level: config.logLevel || "info" })
  ]
});

process.on("unhandledRejection", e => winston.error(e));

/**
 * Set up passport OpenID Connect strategy that works
 * with Azure Active Directory B2C accounts.
 *
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
setupOidcStrategy(config.creds, async (userId, profile) => {
  const userData: IUserData = {
    email: profile._json.emails[0],
    firstName: profile._json.given_name,
    groups: (config.apimUserGroups || "").split(","),
    lastName: profile._json.family_name,
    oid: profile._json.oid,
    productName: config.apimProductName
  };
  try {
    /*
     * The following call expects MSI_ENDPOINT and MSI_SECRET
     * environment variables to be set. They don't appear
     * in the App Service settings; you can check them
     * using Kudu console.
     */
    const loginCreds = await msRestAzure.loginWithAppServiceMSI();
    const subscription = await updateApimUser(userId, userData, loginCreds);
    if (subscription && subscription.name) {
      const fakeFiscalCode = await createFakeProfile(config.adminApiKey, {
        email: userData.email,
        version: 1
      });
      winston.debug(
        "setupOidcStrategy|create service| %s %s",
        fakeFiscalCode,
        profile._json
      );
      await createService(config.adminApiKey, {
        authorized_cidrs: [],
        authorized_recipients: [fakeFiscalCode],
        department_name: profile._json.extension_Department || "",
        organization_fiscal_code: "00000000000",
        organization_name: profile._json.extension_Organization || "",
        service_id: subscription.name,
        service_name: profile._json.extension_Service || ""
      });
      await sendMessage(config.adminApiKey, fakeFiscalCode, {
        content: {
          markdown: [
            `Hello,`,
            `this is a bogus fiscal code you can use to start testing the Digital Citizenship API:\n`,
            fakeFiscalCode,
            `\nYou can start in the developer portal here:`,
            config.apimUrl
          ].join("\n"),
          subject: `Welcome ${userData.firstName} ${userData.lastName} !`
        }
      });
    }
    telemetryClient.trackEvent({
      name: "onboarding.success",
      properties: {
        id: userData.oid,
        username: `${userData.firstName} ${userData.lastName}`
      }
    });
  } catch (e) {
    telemetryClient.trackException(e);
    winston.error("setupOidcStrategy|error", JSON.stringify(e));
  }
});

const app = express();
secureExpressApp(app);

// Avoid stateful in-memory sessions
app.use(
  cookieSession({
    keys: [config.creds.cookieEncryptionKeys[0].key],
    name: "session"
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

/**
 * Express middleware that redirects anonymous users
 * to the sign-in page.
 */
const verifier = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // tslint:disable-next-line:no-object-mutation
  req.query.p = config.policyName;
  if (req.params.userId) {
    // tslint:disable-next-line:no-any no-object-mutation
    (req as any).session.userId = req.params.userId;
  }
  passport.authenticate("azuread-openidconnect", {
    failureRedirect: config.apimUrl,
    response: res,
    session: false
  } as {})(req, res, next);
};

const redirect = (redirectUrl: string) => (
  __: express.Request,
  res: express.Response
) => {
  res.redirect(redirectUrl);
};

app.get("/info", (_: express.Request, res: express.Response) => res.json("OK"));

app.get("/login/:userId", verifier, redirect(config.apimUrl));

app.all("/auth/openid/return", verifier, redirect(config.apimUrl));

app.get("/logout", redirect(config.destroySessionUrl));

//  Navigate to "http://<hostName>:" + .PORT
// + "/login/<userId>?p=" + config.policyName

const port = config.port || 3000;
app.listen(port);

winston.info("Listening on port ", port.toString());
