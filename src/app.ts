/**
 * The aim of this Express Web application is to automate
 * some tasks related to users management in the Digital Citizenship
 * Azure API management developer portal resource.
 *
 */
import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import * as cors from "cors";
import * as dotenv from "dotenv";
import * as express from "express";
import * as morgan from "morgan";
import * as passport from "passport";

import cookieSession = require("cookie-session");
// tslint:disable-next-line: no-var-requires
const packageJson = require("../package.json");

/*
 * Useful for testing the web application locally.
 * 'local.env' file does not need to exists in the
 * production environment (use Application Settings instead)
 */
dotenv.config({ path: __dirname + "/../local.env" });

import * as config from "./config";

import { toExpressHandler } from "italia-ts-commons/lib/express";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "italia-ts-commons/lib/request_middleware";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { setupBearerStrategy } from "./bearer_strategy";
import { initCacheStats } from "./cache";
import { getConfiguration } from "./controllers/configuration";
import {
  getService,
  newReviewRequest,
  putOrganizationLogo,
  putService,
  putServiceLogo,
  ServicePayload
} from "./controllers/services";
import {
  getSubscriptions,
  postSubscriptions,
  putSubscriptionKey
} from "./controllers/subscriptions";
import { getUser, getUsers } from "./controllers/user";
import { secureExpressApp } from "./express";
import { logger } from "./logger";
import {
  getApiClientMiddleware,
  getJiraClientMiddleware
} from "./middlewares/api_client";
import { OptionalParamMiddleware } from "./middlewares/optional_param";
import { RequiredParamMiddleware } from "./middlewares/required_param";
import { getUserFromRequestMiddleware } from "./middlewares/user";

import { SubscriptionData } from "./new_subscription";

import { ExtractFromPayloadMiddleware } from "./middlewares/extract_payload";

import { Logo } from "../generated/api/Logo";
import { ServiceId } from "../generated/api/ServiceId";
import { right } from "fp-ts/lib/Either";

process.on("unhandledRejection", e => logger.error(JSON.stringify(e)));

if (process.env.NODE_ENV === "debug") {
  initCacheStats();
}

const JIRA_CONFIG = config.getJiraConfigOrThrow();

/**
 * Setup an authentication strategy (oauth) for express endpoints.
 */
setupBearerStrategy(passport, config.creds, async (userId, profile) => {
  // executed when the user is logged in
  // userId === profile.oid
  // req.user === profile
  logger.debug("setupBearerStrategy %s %s", userId, JSON.stringify(profile));
});

const app = express();
secureExpressApp(app);

app.use(cors());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true, limit: "5mb" }));
app.use(bodyParser.json({ limit: "5mb" }));
app.use(passport.initialize());
app.use(morgan("combined"));

// Avoid stateful in-memory sessions
app.use(
  cookieSession({
    keys: [config.creds.cookieEncryptionKeys[0].key!],
    name: "session"
  })
);

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

app.get("/info", (_, res) => {
  res.json({
    version: packageJson.version
  });
});

app.get("/logout", (req: express.Request, res: express.Response) => {
  req.logout();
  res.json("OK");
});

app.get(
  ["/subscriptions", "/subscriptions/:email"],
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      OptionalParamMiddleware("email", EmailString)
    )(getSubscriptions)
  )
);

app.post(
  ["/subscriptions", "/subscriptions/:email"],
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      ExtractFromPayloadMiddleware(SubscriptionData),
      OptionalParamMiddleware("email", EmailString)
    )(postSubscriptions)
  )
);

app.put(
  "/subscriptions/:subscriptionId/:keyType",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("subscriptionId", NonEmptyString),
      RequiredParamMiddleware("keyType", NonEmptyString)
    )(putSubscriptionKey)
  )
);

app.get(
  "/services/:serviceId",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString)
    )(getService)
  )
);

app.put(
  "/services/:serviceId",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString),
      ExtractFromPayloadMiddleware(ServicePayload)
    )(putService)
  )
);

app.post(
  "/services/:serviceId/review",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getJiraClientMiddleware(JIRA_CONFIG),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString),
      async _ => right(JIRA_CONFIG) // Pass JIRA_CONFIG as middleware
    )(newReviewRequest)
  )
);

app.put(
  "/services/:serviceId/logo",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", ServiceId),
      ExtractFromPayloadMiddleware(Logo)
    )(putServiceLogo)
  )
);

app.put(
  "/organizations/:organizationFiscalCode/logo",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("organizationFiscalCode", OrganizationFiscalCode),
      ExtractFromPayloadMiddleware(Logo)
    )(putOrganizationLogo)
  )
);

app.get(
  ["/user", "/user/:email"],
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      OptionalParamMiddleware("email", EmailString)
    )(getUser)
  )
);

app.get(
  "/users",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware()
    )(getUsers)
  )
);

app.get("/configuration", toExpressHandler(getConfiguration));

const port = config.port || 3999;
app.listen(port);

logger.debug("Listening on port %s", port.toString());
