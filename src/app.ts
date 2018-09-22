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

import {
  SubscriptionCollection,
  SubscriptionContract
} from "azure-arm-apimanagement/lib/models";

import * as config from "./config";

import {
  getApimUser,
  getUserSubscription,
  getUserSubscriptions,
  regeneratePrimaryKey,
  regenerateSecondaryKey
} from "./apim_operations";

import { isNone, none } from "fp-ts/lib/Option";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { AdUser, setupBearerStrategy } from "./bearer_strategy";
import { secureExpressApp } from "./express";
import { subscribeApimUser } from "./new_subscription";

import ApiManagementClient from "azure-arm-apimanagement";

import { isLeft } from "fp-ts/lib/Either";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Service } from "./api/Service";
import { ServicePublic } from "./api/ServicePublic";
import { APIClient, parseResponse } from "./api_client";
import { logger } from "./logger";
import {
  ExtractFromPayloadMiddleware,
  getApiClientMiddleware,
  getUserFromRequestMiddleware,
  RequiredParamMiddleware
} from "./middlewares";

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

////////////////////////////////////////////

async function getSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser
): Promise<
  | IResponseSuccessJson<SubscriptionCollection>
  | IResponseErrorForbiddenNotAuthorized
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );
  if (isNone(maybeApimUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }
  const apimUser = maybeApimUser.value;
  const subscriptions = await getUserSubscriptions(apiClient, apimUser.name);
  return ResponseSuccessJson(subscriptions);
}

/**
 * List all subscriptions for the logged in user
 */
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

////////////////////////////////////////////

async function postSubscriptions(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
> {
  const user = await getApimUser(apiClient, authenticatedUser.emails[0]);
  if (isNone(user)) {
    return ResponseErrorForbiddenNotAuthorized;
  }
  const subscriptionOrError = await subscribeApimUser(
    apiClient,
    authenticatedUser
  );
  return subscriptionOrError.fold<
    IResponseErrorInternal | IResponseSuccessJson<SubscriptionContract>
  >(
    err => ResponseErrorInternal("Cannot get subscription: " + err),
    ResponseSuccessJson
  );
}

/**
 * Subscribe the logged in user to a configured product.
 * Is it possible to create multiple subscriptions
 * for the same user / product tuple.
 */
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

////////////////////////////////////////////

async function putSubscriptionKey(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  subscriptionId: NonEmptyString,
  keyType: NonEmptyString
): Promise<
  | IResponseSuccessJson<SubscriptionContract>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeUser = await getApimUser(apiClient, authenticatedUser.emails[0]);
  if (isNone(maybeUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }
  const user = maybeUser.value;

  const maybeSubscription = await getUserSubscription(
    apiClient,
    subscriptionId,
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
    keyType === "secondary_key"
      ? await regenerateSecondaryKey(apiClient, subscription.name, user.id)
      : keyType === "primary_key"
        ? await regeneratePrimaryKey(apiClient, subscription.name, user.id)
        : none;

  return maybeUpdatedSubscription.fold<
    IResponseErrorInternal | IResponseSuccessJson<SubscriptionContract>
  >(
    ResponseErrorInternal("Cannot update subscription to renew key"),
    ResponseSuccessJson
  );
}

/**
 * Regenerate keys for an existing subscription
 * belonging to the logged in user.
 */
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

////////////////////////////////////////////

async function getService(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString
): Promise<
  | IResponseSuccessJson<ServicePublic>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );
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
    serviceId,
    apimUser.id
  );
  if (isNone(maybeSubscription)) {
    return ResponseErrorInternal("Cannot get user subscription");
  }

  const errorOrServiceResponse = parseResponse<ServicePublic>(
    await notificationApiClient.getService({
      id: serviceId
    })
  );

  if (isLeft(errorOrServiceResponse)) {
    return ResponseErrorNotFound(
      "Cannot get service",
      "Cannot get existing service"
    );
  }

  return ResponseSuccessJson(errorOrServiceResponse.value);
}

/**
 * Get service data for a specific serviceId.
 */
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

////////////////////////////////////////////

async function putService(
  apiClient: ApiManagementClient,
  authenticatedUser: AdUser,
  serviceId: NonEmptyString,
  servicePayload: Service
): Promise<
  | IResponseSuccessJson<ServicePublic>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    authenticatedUser.emails[0]
  );
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
    serviceId,
    apimUser.id
  );
  if (isNone(maybeSubscription)) {
    return ResponseErrorNotFound(
      "Subscription not found",
      "Cannot get a subscription for the logged in user"
    );
  }

  // TODO: get the old service then filter only
  // authorized fields and merge the changes
  const errorOrService = parseResponse<ServicePublic>(
    await notificationApiClient.updateService({
      service: servicePayload,
      serviceId
    })
  );

  return errorOrService.fold<
    IResponseErrorInternal | IResponseSuccessJson<ServicePublic>
  >(
    errs => ResponseErrorInternal("Error updating service: " + errs.message),
    ResponseSuccessJson
  );
}

/**
 * Update service data for/with a specific serviceId.
 */
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

////////////////////////////////////////////

const port = config.port || 3000;
app.listen(port);

logger.debug("Listening on port %s", port.toString());
