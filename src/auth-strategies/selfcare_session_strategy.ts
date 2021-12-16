/*
 *  Passport strategy to resolve SelfCare Session tokens
 */
import * as express from "express";
import * as t from "io-ts";
import * as passport from "passport";
import { ulid } from "ulid";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import * as jwt from "jsonwebtoken";
import { JWT, processTokenInfo } from "./misc";
import { SelfCareIdentity } from "./selfcare_identity_strategy";

/**
 *
 */
export type SelfCareUser = t.TypeOf<typeof SelfCareUser>;
export const SelfCareUser = t.intersection([
  JWT,
  t.interface({
    family_name: t.string,
    given_name: t.string,
    oid: NonEmptyString,
    organization: t.interface({
      fiscal_number: OrganizationFiscalCode,
      id: NonEmptyString,
      role: NonEmptyString
    })
  })
]);

/**
 * Calls a callback on the logged in user's profile.
 */
export const setupSelfCareSessionStrategy = (
  passportInstance: typeof passport,
  // tslint:disable-next-line:no-any
  { audience, issuer, secret }: any
): express.RequestHandler => {
  const STRATEGY_NAME = "selfcare-session";
  const strategy = new JwtStrategy(
    {
      audience,
      issuer,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret
    },
    processTokenInfo(SelfCareUser)
  );

  passportInstance.use(STRATEGY_NAME, strategy);

  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    passportInstance.authenticate(STRATEGY_NAME, {
      response: res,
      session: false
    } as {})(req, res, next);
  };
};

export const createSessionToken = (
  data: SelfCareIdentity,
  options: { audience: string; issuer: string; signatureKey: string }
): string => {
  const payload = {
    aud: options.audience,
    exp: Math.floor(data.desired_exp.getTime() / 1000),
    iat: Math.floor(Date.now() / 1000),
    iss: options.issuer,
    jti: ulid(),
    sub: data.sub,
    family_name: data.family_name,
    given_name: data.name,
    oid: data.fiscal_number,
    organization: {
      id: data.organization.id,
      role: data.organization.role,
      fiscal_number: data.organization.fiscal_number
    }
  };

  return jwt.sign(payload, options.signatureKey, { algorithm: "RS256" });
};
