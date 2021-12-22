/*
 *  Passport strategy to resolve SelfCare Session tokens
 */
import * as express from "express";
import * as t from "io-ts";
import * as passport from "passport";
import { ulid } from "ulid";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as jwt from "jsonwebtoken";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
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
      fiscal_code: OrganizationFiscalCode,
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
  options: {
    readonly audience: string;
    readonly issuer: string;
    readonly signatureKey: string;
  }
): string => {
  const payload = {
    aud: options.audience,
    exp: Math.floor(data.desired_exp.getTime() / 1000),
    family_name: data.family_name,
    given_name: data.name,
    iat: Math.floor(Date.now() / 1000),
    iss: options.issuer,
    jti: ulid(),
    oid: data.fiscal_number,
    organization: {
      fiscal_code: data.organization.fiscal_code,
      id: data.organization.id,
      role: data.organization.role
    },
    sub: data.sub
  };

  return jwt.sign(payload, options.signatureKey, { algorithm: "RS256" });
};
