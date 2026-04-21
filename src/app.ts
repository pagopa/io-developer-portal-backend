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

import nodeFetch from "node-fetch";

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

import { setupAzureAdStrategy } from "./auth-strategies/azure_ad_strategy";
import { initCacheStats } from "./cache";
import { getConfiguration } from "./controllers/configuration";
import {
  getReviewStatus,
  getService,
  newDisableRequest,
  newReviewRequest,
  putOrganizationLogo,
  putService,
  putServiceLogo,
  ServicePayload
} from "./controllers/services";
import {
  getSubscriptionCIDRs,
  getSubscriptionManage,
  getSubscriptions,
  postSubscriptions,
  putSubscriptionCIDRs,
  putSubscriptionKey
} from "./controllers/subscriptions";
import { getUser, getUsers } from "./controllers/user";
import { secureExpressApp } from "./express";
import { logger } from "./logger";
import {
  getApiClientMiddleware,
  getCmsRestClientMiddleware,
  getJiraClientMiddleware,
  getRequestReviewLegacyQueueClientMiddleware
} from "./middlewares/api_client";
import { OptionalParamMiddleware } from "./middlewares/optional_param";
import { OptionalQueryParamMiddleware } from "./middlewares/optional_query_param";
import { RequiredParamMiddleware } from "./middlewares/required_param";
import { getUserFromRequestMiddleware } from "./middlewares/user";

import { SubscriptionData } from "./new_subscription";

import { ExtractFromPayloadMiddleware } from "./middlewares/extract_payload";

import { Either, fromOption, right, toError } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import { Logo } from "../generated/api/Logo";
import { ServiceId } from "../generated/api/ServiceId";
import { setupSelfCareSessionStrategy } from "./auth-strategies/selfcare_session_strategy";
import {
  getRequestReviewLegacyQueueConfigOrThrow,
  getServicesCmsConfigOrThrow
} from "./config";
import { serviceData } from "./controllers/service_data";

import {
  IntegerFromString,
  NonNegativeInteger
} from "italia-ts-commons/lib/numbers";
import { ProblemJson } from "italia-ts-commons/lib/responses";
import { CIDRsPayload } from "../generated/api/CIDRsPayload";
import { getApimUser, IExtendedUserContract } from "./apim_operations";
import { getApimAccountEmail } from "./utils/session";

process.on("unhandledRejection", e => logger.error(JSON.stringify(e)));

if (process.env.NODE_ENV === "debug") {
  initCacheStats();
}

const JIRA_CONFIG = config.getJiraConfigOrThrow();

const REQUEST_REVIEW_LEGACY_QUEUE_CONFIG = getRequestReviewLegacyQueueConfigOrThrow();

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
    keys: [config.azureAdCreds.cookieEncryptionKeys[0].key!],
    name: "session"
  })
);

/**
 * Express middleware that checks oauth token.
 */
const sessionTokenVerifier = (() => {
  switch (config.IDP) {
    case "azure-ad":
      return setupAzureAdStrategy(passport, config.azureAdCreds);
    case "selfcare":
      return setupSelfCareSessionStrategy(
        passport,
        config.selfcareSessionCreds
      );
    default:
      const idp: never = config.IDP;
      throw new Error(`Invalid IDP: ${idp}`);
  }
})();

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
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      OptionalParamMiddleware("email", EmailString),
      OptionalQueryParamMiddleware(
        "offset",
        IntegerFromString.pipe(NonNegativeInteger)
      ),
      OptionalQueryParamMiddleware(
        "limit",
        IntegerFromString.pipe(NonNegativeInteger)
      ),
      OptionalQueryParamMiddleware("name", NonEmptyString)
    )(getSubscriptions)
  )
);

app.get(
  ["/subscription-manage", "/subscription-manage/:email"],
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      OptionalParamMiddleware("email", EmailString)
    )(getSubscriptionManage)
  )
);

app.get(
  "/subscriptions/:subscriptionId/cidrs",
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("subscriptionId", NonEmptyString)
    )(getSubscriptionCIDRs)
  )
);

app.post(
  ["/subscriptions", "/subscriptions/:email"],
  sessionTokenVerifier,
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
  "/subscriptions/:subscriptionId/cidrs",
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("subscriptionId", NonEmptyString),
      ExtractFromPayloadMiddleware(CIDRsPayload)
    )(putSubscriptionCIDRs)
  )
);

app.put(
  "/subscriptions/:subscriptionId/:keyType",
  sessionTokenVerifier,
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
  sessionTokenVerifier,
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
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString),
      ExtractFromPayloadMiddleware(ServicePayload),
      getCmsRestClientMiddleware(getServicesCmsConfigOrThrow())
    )(putService)
  )
);

/* Get Review Status */
app.get(
  "/services/:serviceId/review",
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getJiraClientMiddleware(JIRA_CONFIG),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString)
    )(getReviewStatus)
  )
);

/* Post a new Review Request for Service Id */
app.post(
  "/services/:serviceId/review",
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getJiraClientMiddleware(JIRA_CONFIG),
      getRequestReviewLegacyQueueClientMiddleware(
        REQUEST_REVIEW_LEGACY_QUEUE_CONFIG
      ),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString),
      async _ => right<never, typeof JIRA_CONFIG>(JIRA_CONFIG) // Pass JIRA_CONFIG as middleware
    )(newReviewRequest)
  )
);

/* Post a disable Request for Service Id */
app.put(
  "/services/:serviceId/disable",
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getJiraClientMiddleware(JIRA_CONFIG),
      getUserFromRequestMiddleware(),
      RequiredParamMiddleware("serviceId", NonEmptyString),
      async _ => right<never, typeof JIRA_CONFIG>(JIRA_CONFIG) // Pass JIRA_CONFIG as middleware
    )(newDisableRequest)
  )
);

app.put(
  "/services/:serviceId/logo",
  sessionTokenVerifier,
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
  sessionTokenVerifier,
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
  sessionTokenVerifier,
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
  sessionTokenVerifier,
  wrapRequestHandler(
    withRequestMiddlewares(
      getApiClientMiddleware(),
      getUserFromRequestMiddleware()
    )(getUsers)
  )
);

if (config.IDP === "azure-ad") {
  // The following utility retrieves APIM account id for the current authenticated user
  // It does the job for this very specific use case, if needed in future we may think about moving it into common utils
  const getApimUserIdForLoggedUser = (
    req: express.Request
  ): Promise<Either<Error, string>> =>
    tryCatch(
      () => getApiClientMiddleware()(req),
      _ => "Failed to create APIM client"
    )
      .chain(_ =>
        fromEither(_).mapLeft(
          __ => "Failed to create APIM client (should not pass here)"
        )
      )
      .chain(client =>
        tryCatch(
          () => getApimUser(client, getApimAccountEmail(req.user)),
          _ => "Failed to fetch APIM user"
        )
      )
      .chain(maybeUser => fromEither(fromOption("Empty APIM user")(maybeUser as Option<IExtendedUserContract>) ))
      .map(({ id }) => id.substring(id.lastIndexOf("/")))
      .mapLeft(_ => new Error(_))
      .run();

  // Expose proxied endpoints to retrieve admin data for services
  app.get(
    "/organizations/:organizationFiscalCode/services",
    sessionTokenVerifier,
    wrapRequestHandler(
      withRequestMiddlewares(
        getApiClientMiddleware(),
        getUserFromRequestMiddleware(),
        RequiredParamMiddleware(
          "organizationFiscalCode",
          OrganizationFiscalCode
        )
      )(serviceData)
    )
  );
}
app.get("/configuration", toExpressHandler(getConfiguration));

const port = config.port || 3999;
app.listen(port);

logger.debug("Listening on port %s", port.toString());
