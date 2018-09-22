/**
 * The aim of this Express Web application is to automate
 * some tasks related to users management in the Digital Citizenship
 * Azure API management developer portal resource.
 *
 * The flow starts when the user, already logged into the developoer portal,
 * clicks on a call-to-action that links to the '/login/<userId>' endpoint.
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

import { SubscriptionContract } from "azure-arm-apimanagement/lib/models";

import * as config from "./config";

import {
  getApimUser,
  getUserSubscription,
  getUserSubscriptions,
  newApiClient,
  regeneratePrimaryKey,
  regenerateSecondaryKey
} from "./apim_operations";

import { toExpressHandler } from "italia-ts-commons/lib/express";

import { isNone, none } from "fp-ts/lib/Option";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { IProfile, setupBearerStrategy } from "./bearer_strategy";
import { secureExpressApp } from "./express";
import { subscribeApimUser } from "./new_subscription";

import { ServicePublic } from "./api/ServicePublic";
import { APIClient, parseResponse } from "./api_client";
import { logger } from "./logger";

process.on("unhandledRejection", e => logger.error(JSON.stringify(e)));

/**
 * Setup an authentication strategy (oauth) for express endpoints.
 */
setupBearerStrategy(passport, config.creds, async (userId, profile) => {
  // executed when the user is logged in
  // userId === profile.oid
  // req.user === profile
  logger.debug("setupBearerStrategy %s %s", userId, profile);
});

const notificationApiClient = APIClient(config.adminApiUrl, config.adminApiKey);

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

/**
 * List all subscriptions for the logged in user
 */
app.get(
  "/subscriptions",
  ouathVerifier,
  toExpressHandler(async req => {
    if (!req.user || !req.user.oid) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const apiClient = await newApiClient();
    // get the subscription of the logged in user
    const maybeApimUser = await getApimUser(apiClient, req.user.emails[0]);
    if (isNone(maybeApimUser)) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const apimUser = maybeApimUser.value;
    const subscriptions = await getUserSubscriptions(apiClient, apimUser.name);
    return ResponseSuccessJson(subscriptions);
  })
);

/**
 * Subscribe the logged in user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
app.post(
  "/subscriptions",
  ouathVerifier,
  toExpressHandler(async req => {
    if (!req.user || !req.user.oid) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const apiClient = await newApiClient();

    // Any authenticated user can subscribe
    // to the Digital Citizenship APIs
    const user = await getApimUser(apiClient, req.user.emails[0]);
    if (isNone(user)) {
      return ResponseErrorForbiddenNotAuthorized;
    }

    const subscriptionOrError = await subscribeApimUser(
      apiClient,
      req.user as IProfile
    );
    return subscriptionOrError.fold<
      IResponseErrorInternal | IResponseSuccessJson<SubscriptionContract>
    >(
      err => ResponseErrorInternal("Cannot get subscription: " + err),
      ResponseSuccessJson
    );
  })
);

/**
 * Regenerate keys for an existing subscription
 * belonging to the logged in user.
 */
app.put(
  "/subscriptions/:subscriptionId/:keyType",
  ouathVerifier,
  toExpressHandler(async req => {
    if (!req.user || !req.user.oid) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const apiClient = await newApiClient();

    const maybeUser = await getApimUser(apiClient, req.user.emails[0]);
    if (isNone(maybeUser)) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const user = maybeUser.value;

    const maybeSubscription = await getUserSubscription(
      apiClient,
      req.params.subscriptionId,
      user.id
    );
    if (isNone(maybeSubscription)) {
      return ResponseErrorNotFound(
        "Subscription not found",
        "Cannot find a subscription for the logged in user"
      );
    }
    const subscription = maybeSubscription.value;

    const maybeUpdatedSubscription =
      req.params.keyType === "secondary_key"
        ? await regenerateSecondaryKey(apiClient, subscription.name, user.id)
        : req.params.keyType === "primary_key"
          ? await regeneratePrimaryKey(apiClient, subscription.name, user.id)
          : none;

    return maybeUpdatedSubscription.fold<
      IResponseErrorInternal | IResponseSuccessJson<SubscriptionContract>
    >(
      ResponseErrorInternal("Cannot update subscription to renew key"),
      ResponseSuccessJson
    );
  })
);

/**
 * Get service data for a specific serviceId.
 */
app.get(
  "/services/:serviceId",
  ouathVerifier,
  toExpressHandler(async req => {
    if (!req.user || !req.user.oid) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const apiClient = await newApiClient();

    const maybeApimUser = await getApimUser(apiClient, req.user.emails[0]);
    if (isNone(maybeApimUser)) {
      return ResponseErrorNotFound(
        "API user not found",
        "Cannot find a user in the API management with the provided email address"
      );
    }
    const apimUser = maybeApimUser.value;

    // Authenticates this request against the logged in user
    // checking that serviceId = subscriptionId
    const maybeSubscription = await getUserSubscription(
      apiClient,
      req.params.serviceId,
      apimUser.id
    );
    if (isNone(maybeSubscription)) {
      return ResponseErrorInternal("Cannot get user subscription");
    }

    const service = await notificationApiClient.getService({
      id: req.params.serviceId
    });

    if (!service) {
      return ResponseErrorNotFound(
        "Cannot get service",
        "Cannot get existing service"
      );
    }

    return ResponseSuccessJson(service);
  })
);

/**
 * Update service data for/with a specific serviceId.
 */
app.put(
  "/services/:serviceId",
  ouathVerifier,
  toExpressHandler(async req => {
    if (!req.user || !req.user.oid) {
      return ResponseErrorForbiddenNotAuthorized;
    }
    const apiClient = await newApiClient();

    const maybeApimUser = await getApimUser(apiClient, req.user.emails[0]);
    if (isNone(maybeApimUser)) {
      return ResponseErrorNotFound(
        "API user not found",
        "Cannot find a user in the API management with the provided email address"
      );
    }
    const apimUser = maybeApimUser.value;

    // Authenticates this request against the logged in user
    // checking that he owns a subscription with the provided serviceId
    const maybeSubscription = await getUserSubscription(
      apiClient,
      req.params.serviceId,
      apimUser.id
    );
    if (isNone(maybeSubscription)) {
      return ResponseErrorNotFound(
        "Subscription not found",
        "Cannot get a subscription for the logged in user"
      );
    }

    const errorOrService = parseResponse<ServicePublic>(
      await notificationApiClient.updateService({
        service: req.body,
        serviceId: req.params.serviceId
      })
    );

    return errorOrService.fold<
      IResponseErrorInternal | IResponseSuccessJson<ServicePublic>
    >(
      errs => ResponseErrorInternal("Error updating service: " + errs.message),
      ResponseSuccessJson
    );
  })
);

//  Navigate to "http://<hostName>:" + .PORT
// + "/login/<userId>?p=" + config.policyName

const port = config.port || 3000;
app.listen(port);

logger.debug("Listening on port %s", port.toString());
