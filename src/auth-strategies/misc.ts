import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { logger } from "../logger";

export type UnixTime = t.TypeOf<typeof UnixTime>;
export const UnixTime = new t.Type<Date, number, unknown>(
  "UnixTime",
  (d): d is Date => typeof d === "object" && d !== null && d instanceof Date,
  (e, c) => {
    if (!t.number.is(e)) {
      return t.failure(e, c, "timestamp must be a number");
    }
    return t.success(new Date(e * 1000));
  },
  d => Math.floor(d.getTime() / 1000)
);

/**
 * Base structure of a JWT
 */
export type JWT = t.TypeOf<typeof JWT>;
export const JWT = t.partial({
  aud: NonEmptyString,
  exp: UnixTime,
  iat: UnixTime,
  iss: NonEmptyString,
  jti: NonEmptyString,
  sub: NonEmptyString
});

/**
 * Shared utils to post-process token info data
 * @param codec
 * @param cb
 * @returns
 */
export const processTokenInfo = <A, O>(codec: t.Type<A, O>) => async (
  tokenInfo: unknown,
  done: (error: unknown, user?: unknown) => void
) =>
  codec.decode(tokenInfo).fold(
    err => {
      logger.error("cannot decode token data, %s", readableReport(err));
      return done(new Error("Wrong token info data"));
    },
    user => {
      logger.debug("user authenticated %s", JSON.stringify(user));
      return done(undefined, user);
    }
  );
