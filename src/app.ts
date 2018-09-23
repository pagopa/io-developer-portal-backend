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
/*
 * Useful for testing the web application locally.
 * 'local.env' file does not need to exists in the
 * production environment (use Application Settings instead)
 */
dotenv.config({ path: __dirname + "/../local.env" });

import * as config from "./config";

import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "italia-ts-commons/lib/request_middleware";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Service } from "./api/Service";
import { setupBearerStrategy } from "./bearer_strategy";
import { getService, putService } from "./controllers/services";
import {
  getSubscriptions,
  postSubscriptions,
  putSubscriptionKey
} from "./controllers/subscriptions";
import { secureExpressApp } from "./express";
import { logger } from "./logger";
import { getApiClientMiddleware } from "./middlewares/api_client";
import { ExtractFromPayloadMiddleware } from "./middlewares/extract_payload";
import { RequiredParamMiddleware } from "./middlewares/required_param";
import { getUserFromRequestMiddleware } from "./middlewares/user";

process.on("unhandledRejection", e => logger.error(JSON.stringify(e)));

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
app.use(bodyParser.urlencoded({ extended: true }));
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

app.get("/logout", (req: express.Request, res: express.Response) => {
  req.logout();
  res.json("OK");
});

app.get(
  "/subscriptions",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware()
    )(getSubscriptions)
  )
);

app.post(
  "/subscriptions",
  ouathVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware()
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
      ExtractFromPayloadMiddleware(Service)
    )(putService)
  )
);

const port = config.port || 3000;
app.listen(port);

logger.debug("Listening on port %s", port.toString());
