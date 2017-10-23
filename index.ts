// tslint:disable:no-console

import * as express from "express";
import * as passport from "passport";
import { findById, OIDCStrategy } from "passport-azure-ad";

const app = express();

app.use(passport.initialize());

const clientId = process.env.clientId;
const policyName = process.env.policyName;
// const clientSecret = process.env.clientSecret;
const tenantId = process.env.tenantId;

const strategyOptions = {
  identityMetadata:
    "https://login.microsoftonline.com/" +
    tenantId +
    "/v2.0/.well-known/openid-configuration/",
  clientId,
  // clientSecret,
  policyName,
  isB2C: true,
  validateIssuer: true,
  loggingLevel: "info",
  passReqToCallback: false

  // responseType: config.creds.responseType,
  // responseMode: config.creds.responseMode,
  // redirectUrl: config.creds.redirectUrl,
  // allowHttpForRedirectUrl: config.creds.allowHttpForRedirectUrl,

  // issuer: config.creds.issuer,
  // scope: config.creds.scope,
  // loggingLevel: config.creds.loggingLevel,
  // nonceLifetime: config.creds.nonceLifetime,
  // nonceMaxAmount: config.creds.nonceMaxAmount,
  // useCookieInsteadOfSession: config.creds.useCookieInsteadOfSession,
  // cookieEncryptionKeys: config.creds.cookieEncryptionKeys,
  // clockSkew: config.creds.clockSkew
};

passport.use(
  new OIDCStrategy(
    strategyOptions,
    (token: string, done: (a: {} | undefined, b?: {}, c?: {}) => {}) => {
      console.log(token);

      // findById(token.sub, (_: {}, user: {}) => {
      //   console.log(user);
      // });

      done(undefined, {}, token);
    }
  )
);

app.use((_, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get(
  "/",
  passport.authenticate("oauth-bearer", { session: false }),
  (req, res) => {
    // const claims = req.authInfo;
    // console.log("User info: ", req.user);
    // console.log("Validated claims: ", claims);
    // claims.scp.split(" ").indexOf("demo.read") >= 0
    res.status(200).json(req);
  }
);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log("Listening on port " + port);
});
