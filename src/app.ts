/**
 * The aim of this Express Web application is to automate
 * some tasks related to users management in the Digital Citizenship
 * Azure API management developer portal resource.
 *
 * The flow starts when the user, already logged into the developoer portal,
 * clicks on a call-to-action that links to the '/login/<userId>' endpoint.
 */

import * as cors from "cors";
import * as dotenv from "dotenv";
import * as morgan from "morgan";
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

import cookieSession = require("cookie-session");

import * as msRestAzure from "ms-rest-azure";

import { getUserSubscriptions, IUserData, updateApimUser } from "./account";
// import { secureExpressApp } from "./express";
import { createFakeProfile } from "./fake_profile";
import { sendMessage } from "./message";
import { getService, upsertService } from "./service";

const telemetryClient = new appinsights.TelemetryClient();

import ApiManagementClient from "azure-arm-apimanagement";
import * as winston from "winston";
import { IProfile, setupBearerStrategy } from "./bearer_strategy";

winston.configure({
  transports: [
    new winston.transports.Console({ level: config.logLevel || "info" })
  ]
});

process.on("unhandledRejection", e => winston.error(e));

setupBearerStrategy(passport, config.creds, async (userId, profile) => {
  winston.info("setupBearerStrategy:userid", userId);
  winston.info("setupBearerStrategy:profile", profile);
});

/**
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
async function assignUserToProducts(profile: IProfile): Promise<void> {
  const userData: IUserData = {
    email: profile.emails[0],
    firstName: profile.given_name,
    groups: (config.apimUserGroups || "").split(","),
    lastName: profile.family_name,
    oid: profile.oid,
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
    const apiClient = new ApiManagementClient(
      loginCreds,
      config.subscriptionId
    );

    const subscription = await updateApimUser(
      apiClient,
      userData.oid,
      userData
    );
    if (!subscription || !subscription.name) {
      return;
    }
    const fakeFiscalCode = await createFakeProfile(config.adminApiKey, {
      email: userData.email,
      version: 0
    });
    winston.debug(
      "setupOidcStrategy|create service| %s %s",
      fakeFiscalCode,
      profile
    );
    await upsertService(config.adminApiKey, {
      authorized_cidrs: [],
      authorized_recipients: [fakeFiscalCode],
      department_name: profile.extension_Department || "",
      organization_fiscal_code: "00000000000",
      organization_name: profile.extension_Organization || "",
      service_id: subscription.name,
      service_name: profile.extension_Service || ""
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
    telemetryClient.trackEvent({
      name: "onboarding.success",
      properties: {
        id: userData.oid,
        username: `${userData.firstName} ${userData.lastName}`
      }
    });
  } catch (e) {
    telemetryClient.trackEvent({
      name: "onboarding.failure",
      properties: {
        id: userData.oid,
        username: `${userData.firstName} ${userData.lastName}`
      }
    });
    telemetryClient.trackException({ exception: e });
    winston.error("setupOidcStrategy|error", JSON.stringify(e));
  }
}

const app = express();
app.use(cors());
// secureExpressApp(app);

// Avoid stateful in-memory sessions
app.use(
  cookieSession({
    keys: [config.creds.cookieEncryptionKeys[0].key!],
    name: "session"
  })
);

// app.use(express.logger());

app.use(methodOverride());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(morgan("combined"));

app.get("/info", (_: express.Request, res: express.Response) => res.json("OK"));

app.get("/logout", (req: express.Request, res: express.Response) => {
  req.logout();
  res.json("OK");
});

/**
 * Express middleware that check oauth token.
 */
const ouathVerifier = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  passport.authenticate("oauth-bearer", {
    response: res,
    session: false
  } as {})(
    // adds policyName in case none is provided
    { ...req, query: { ...req.query, p: config.policyName } },
    res,
    next
  );
};

app.get("/user", ouathVerifier, (req: express.Request, res: express.Response) =>
  res.json(req.user)
);

app.get(
  "/subscriptions",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (req.user) {
      const loginCreds = await msRestAzure.loginWithAppServiceMSI();
      const apiClient = new ApiManagementClient(
        loginCreds,
        config.subscriptionId
      );
      res.json(await getUserSubscriptions(apiClient, req.user.id));
    }
  }
);

app.get(
  "/service/:serviceId",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (req.user) {
      // TODO: authenticate this request against logged in user
      // ie. use api key from user subscription = serviceId
      res.json(await getService(config.adminApiKey, req.params.serviceId));
    }
  }
);

app.post(
  "/service",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (req.user) {
      // TODO: authenticate this request against logged in user
      // ie. use api key from user subscription = serviceId
      await assignUserToProducts(req.user.idToken);
    }
    res.json("OK");
  }
);

//  Navigate to "http://<hostName>:" + .PORT
// + "/login/<userId>?p=" + config.policyName

const port = config.port || 3000;
app.listen(port);

winston.debug("Listening on port %s", port.toString());
