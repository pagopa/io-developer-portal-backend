/*
 *  Passport strategy to resolve SelfCare Identity tokens
 */
import * as express from "express";
import * as t from "io-ts";
import * as passport from "passport";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import { JWT, processTokenInfo, UnixTime } from "./misc";

/**
 *
 */
export type SelfCareIdentity = t.TypeOf<typeof SelfCareIdentity>;
export const SelfCareIdentity = t.intersection([
  JWT,
  t.interface({
    desired_exp: UnixTime,
    family_name: t.string,
    fiscal_number: FiscalCode,
    name: t.string,
    organization: t.interface({
      fiscal_code: OrganizationFiscalCode,
      id: NonEmptyString,
      role: NonEmptyString
    })
  })
]);

/**
 * Calls a callback on the logged in user's profile.
 */
export const setupSelfCareIdentityStrategy = (
  passportInstance: typeof passport,
  // tslint:disable-next-line:no-any
  { audience, issuer, secret }: any
) => {
  const STRATEGY_NAME = "selfcare-identity";
  const strategy = new JwtStrategy(
    {
      algorithms: ["RS256"],
      audience,
      issuer,
      jwtFromRequest: ExtractJwt.fromUrlQueryParameter("id"),
      ignoreExpiration: true,
      secretOrKey: secret
    },
    processTokenInfo(SelfCareIdentity)
  );

  passportInstance.use(STRATEGY_NAME, strategy);

  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    passportInstance.authenticate(STRATEGY_NAME, function(err, user, ...rest) {
      if (err) {
        console.error("==> authenticate", err);
        res.send({ type: "auth error", err, rest });
        res.status(480);
        return next(err);
      }
      if (!user) {
        console.error("==> no user", rest);
        console.error("-->", secret);
        res.send({ type: "no user", rest });
        res.status(481);
        return next(new Error("no user!"));
      }
      req.user = user;
      next(err);
    })(req, res, next);
  };
};
