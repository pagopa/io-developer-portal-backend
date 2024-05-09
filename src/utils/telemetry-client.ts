import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { IntegerFromString } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as ai from "applicationinsights";
import * as E from "fp-ts/lib/Either";

// the internal function runtime has MaxTelemetryItem per second set to 20 by default
// @see https://github.com/Azure/azure-functions-host/blob/master/src/WebJobs.Script/Config/ApplicationInsightsLoggerOptionsSetup.cs#L29
const DEFAULT_SAMPLING_PERCENTAGE = 5;

// Avoid to initialize Application Insights more than once
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function initTelemetryClient(env = process.env) {
  const instrumentationKeyOrError = NonEmptyString.decode(
    env.APPINSIGHTS_INSTRUMENTATIONKEY
  );

  if (E.isLeft(instrumentationKeyOrError)) {
    throw new Error("APPINSIGHTS_INSTRUMENTATIONKEY is not defined");
  }

  return ai.defaultClient
    ? ai.defaultClient
    : initAppInsights(instrumentationKeyOrError.value, {
        disableAppInsights: env.APPINSIGHTS_DISABLE === "true",
        samplingPercentage: getSamplingPercentage(env)
      });
}
const getSamplingPercentage = (env = process.env): number => {
  const maybeASamplingPercentage = IntegerFromString.decode(
    env.APPINSIGHTS_SAMPLING_PERCENTAGE
  );
  if (E.isRight(maybeASamplingPercentage)) {
    return maybeASamplingPercentage.value;
  }
  return DEFAULT_SAMPLING_PERCENTAGE;
};

export type TelemetryClient = ReturnType<typeof initTelemetryClient>;
