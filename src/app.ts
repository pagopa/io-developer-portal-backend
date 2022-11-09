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

import { Either, fromOption, right, toError } from "fp-ts/lib/Either";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import { Logo } from "../generated/api/Logo";
import { ServiceId } from "../generated/api/ServiceId";
import { setupSelfCareIdentityStrategy } from "./auth-strategies/selfcare_identity_strategy";
import { setupSelfCareSessionStrategy } from "./auth-strategies/selfcare_session_strategy";
import { selfcareIdentityCreds } from "./config";
import { resolveSelfCareIdentity } from "./controllers/idp";
import { serviceData } from "./controllers/service_data";
import { getSelfCareIdentityFromRequestMiddleware } from "./middlewares/idp";

import { ProblemJson } from "italia-ts-commons/lib/responses";
import { getApimUser } from "./apim_operations";
import { getApimAccountEmail } from "./utils/session";

process.on("unhandledRejection", e => logger.error(JSON.stringify(e)));

if (process.env.NODE_ENV === "debug") {
  initCacheStats();
}

const JIRA_CONFIG = config.getJiraConfigOrThrow();

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
      OptionalParamMiddleware("email", EmailString)
    )(getSubscriptions)
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
      ExtractFromPayloadMiddleware(ServicePayload)
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

if (config.IDP === "selfcare") {
  // Express middleware that checks IdentityToken
  const identityTokenVerifier = setupSelfCareIdentityStrategy(
    passport,
    selfcareIdentityCreds
  );

  app.get(
    "/idp/selfcare/resolve-identity",
    identityTokenVerifier,
    wrapRequestHandler(
      withRequestMiddlewares(
        getSelfCareIdentityFromRequestMiddleware(),
        getApiClientMiddleware()
      )(resolveSelfCareIdentity)
    )
  );

  // Expose subscription migration features
  app.use(
    "/subscriptions/migrations/*",
    sessionTokenVerifier,
    async (req, res) => {
      const url = `${config.SUBSCRIPTION_MIGRATIONS_URL}/organizations/${req.user?.organization.fiscal_code}/${req.params[0]}`;
      const { method, body } = req;

      try {
        const result = await nodeFetch(url, {
          body: ["GET", "HEAD"].includes(method.toUpperCase())
            ? undefined
            : body,
          headers: {
            "X-Functions-Key": config.SUBSCRIPTION_MIGRATIONS_APIKEY
          },
          method
        });

        res.status(result.status);
        res.send(await result.text());
      } catch (error) {
        logger.error(
          `Failed to proxy request to subscription migrations service`,
          error
        );
        res.status(500);
      }

      res.end();
    }
  );
} else if (config.IDP === "azure-ad") {
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
      .chain(_ => fromEither(fromOption("Empty APIM user")(_)))
      .map(({ id }) => id.substring(id.lastIndexOf("/")))
      .mapLeft(_ => new Error(_))
      .run();

  // Expose subscription migration features
  app.use(
    "/subscriptions/migrations/*",
    sessionTokenVerifier,
    // enrich request with apim user id
    async (req, res, next) => {
      try {
        const apimUserId = await getApimUserIdForLoggedUser(req);
        // tslint:disable-next-line: no-object-mutation
        req.user.apimUserId = apimUserId;
        next();
      } catch (error) {
        res.status(500);
        res.json(ProblemJson.encode({ detail: toError(error).message }));
        res.end();
      }
    },
    async (req, res) => {
      const url = `${config.SUBSCRIPTION_MIGRATIONS_URL}/delegates/${req.user.apimUserId}/${req.params[0]}`;

      const { method, body } = req;

      try {
        const result = await nodeFetch(url, {
          body: ["GET", "HEAD"].includes(method.toUpperCase())
            ? undefined
            : body,
          headers: {
            "X-Functions-Key": config.SUBSCRIPTION_MIGRATIONS_APIKEY
          },
          method
        });

        res.status(result.status);
        res.send(await result.text());
      } catch (error) {
        logger.error(
          `Failed to proxy request to subscription migrations service`,
          error
        );
        res.status(500);
      }

      res.end();
    }
  );
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
}

app.get("/configuration", toExpressHandler(getConfiguration));

const port = config.port || 3999;
app.listen(port);

logger.debug("Listening on port %s", port.toString());
