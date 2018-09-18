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

import {
  addUserSubscriptionToProduct,
  addUserToGroups,
  getExistingUser,
  getUserSubscription,
  getUserSubscriptions,
  IUserData
} from "./account";
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
 * Convert a profileobtained from oauth authentication
 * to the user data needed to perform API operations.
 */
function toUserData(profile: IProfile): IUserData {
  return {
    email: profile.emails[0],
    firstName: profile.given_name,
    groups: (config.apimUserGroups || "").split(","),
    lastName: profile.family_name,
    oid: profile.oid,
    productName: config.apimProductName
  };
}

/**
 * Assigns logged-in user to API management products and groups,
 * then create a Service tied to the user subscription using
 * the Functions API.
 */
async function subscribeApimUser(
  apiClient: ApiManagementClient,
  profile: IProfile
): Promise<void> {
  const userData = toUserData(profile);
  try {
    // user must already exists (created at login)
    const user = await getExistingUser(apiClient, userData.oid);

    // idempotent
    await addUserToGroups(apiClient, user, userData.groups);

    // not idempotent: creates a new subscription every time !
    const subscription = await addUserSubscriptionToProduct(
      apiClient,
      user,
      config.apimProductName
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

    // idempotent
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

// if (
//   (!user.identities ||
//     !user.identities[0] ||
//     user.identities[0].provider !== "AadB2C" ||
//     user.identities[0].id !== userData.oid)
// )

/**
 * Express middleware that check oauth token.
 */
const ouathVerifier = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // adds policyName in case none is provided
  // tslint:disable-next-line:no-object-mutation
  req.query.p = config.policyName;
  passport.authenticate("oauth-bearer", {
    response: res,
    session: false
  } as {})(req, res, next);
};

app.get("/info", (_: express.Request, res: express.Response) => res.json("OK"));

app.get("/logout", (req: express.Request, res: express.Response) => {
  req.logout();
  res.json("OK");
});

app.get("/user", ouathVerifier, (req: express.Request, res: express.Response) =>
  res.json(req.user)
);

/**
 * List all subscriptions for the logged in user
 */
app.get(
  "/subscriptions",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (!req.user || !req.user.oid) {
      return res.status(401);
    }
    const loginCreds = await msRestAzure.loginWithAppServiceMSI();
    const apiClient = new ApiManagementClient(
      loginCreds,
      config.subscriptionId
    );
    // get the subscription of the logged in user
    return res.json(await getUserSubscriptions(apiClient, req.user.oid));
  }
);

/**
 * Subscribe the logged in user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
app.post(
  "/subscriptions",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (!req.user || !req.user.oid) {
      return res.status(401);
    }
    const loginCreds = await msRestAzure.loginWithAppServiceMSI();
    const apiClient = new ApiManagementClient(
      loginCreds,
      config.subscriptionId
    );
    const user = await getExistingUser(apiClient, req.user.oid);
    // Any authenticated user can subscribe
    // to the Digital Citizenship APIs
    if (!user) {
      return res.status(401);
    }
    // TODO: check this cast
    await subscribeApimUser(apiClient, req.user as IProfile);
    return user;
  }
);

/**
 * Get service data for a specific serviceId.
 */
app.get(
  "/services/:serviceId",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (!req.user || !req.user.oid) {
      return res.status(401);
    }
    // Authenticates this request against the logged in user
    // checking that serviceId = subscriptionId
    const loginCreds = await msRestAzure.loginWithAppServiceMSI();
    const apiClient = new ApiManagementClient(
      loginCreds,
      config.subscriptionId
    );
    const subscription = await getUserSubscription(
      apiClient,
      req.params.serviceId
    );
    if (subscription && subscription.userId === req.user.oid) {
      return res.json(
        await getService(config.adminApiKey, req.params.serviceId)
      );
    }
    return res.status(401);
  }
);

/**
 * Upsert service data for/with a specific serviceId.
 */
app.post(
  "/services/:serviceId",
  ouathVerifier,
  async (req: express.Request, res: express.Response) => {
    if (!req.user || !req.user.oid) {
      return res.status(401);
    }
    // Authenticates this request against the logged in user
    // checking that serviceId = subscriptionId
    const loginCreds = await msRestAzure.loginWithAppServiceMSI();
    const apiClient = new ApiManagementClient(
      loginCreds,
      config.subscriptionId
    );
    const subscription = await getUserSubscription(
      apiClient,
      req.params.serviceId
    );
    if (subscription && subscription.userId === req.user.oid) {
      // TODO: upsert service data
    }
    return res.json("TODO");
  }
);

//  Navigate to "http://<hostName>:" + .PORT
// + "/login/<userId>?p=" + config.policyName

const port = config.port || 3000;
app.listen(port);

winston.debug("Listening on port %s", port.toString());
