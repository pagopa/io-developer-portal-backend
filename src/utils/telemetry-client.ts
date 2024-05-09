import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as ai from "applicationinsights";
import * as E from "fp-ts/lib/Either";

// Avoid to initialize Application Insights more than once
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function initTelemetryClient(env = process.env): ai.TelemetryClient {
  const instrumentationKeyOrError = NonEmptyString.decode(
    env.APPINSIGHTS_INSTRUMENTATIONKEY
  );

  if (E.isLeft(instrumentationKeyOrError)) {
    throw new Error("APPINSIGHTS_INSTRUMENTATIONKEY is not defined");
  }

  return ai.defaultClient
    ? ai.defaultClient
    : new ai.TelemetryClient(instrumentationKeyOrError.value);
}
