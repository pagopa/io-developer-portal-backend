/**
 * Winston logger shared configuration.
 */
import * as appInsights from "applicationinsights";
import * as logform from "logform";
import { createLogger, format, transports } from "winston";
import * as config from "./config";

const { timestamp, printf } = logform.format;

export const logger = createLogger({
  format: format.combine(
    timestamp(),
    format.splat(),
    format.simple(),
    printf(nfo => {
      const message = `${nfo.timestamp} [${nfo.level}]: ${nfo.message}`;

      // Invia il log a Application Insights
      if (appInsights.defaultClient) {
        appInsights.defaultClient.trackTrace({
          message,
          severity: getSeverityLevel(nfo.level)
        });
      }
      return message;
    })
  ),
  transports: [new transports.Console({ level: config.logLevel || "info" })]
});

function getSeverityLevel(level: string): appInsights.Contracts.SeverityLevel {
  switch (level) {
    case "error":
      return appInsights.Contracts.SeverityLevel.Error;
    case "warn":
      return appInsights.Contracts.SeverityLevel.Warning;
    case "info":
      return appInsights.Contracts.SeverityLevel.Information;
    case "verbose":
    case "debug":
      return appInsights.Contracts.SeverityLevel.Verbose;
    default:
      return appInsights.Contracts.SeverityLevel.Information;
  }
}

export const startAppInsights = () => {
  // collect monotoring metrics automatically
  appInsights
    .setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
    .setAutoCollectConsole(false) // Disabilita la raccolta automatica dei log
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);

  // tslint:disable-next-line: no-object-mutation
  appInsights.defaultClient.config.samplingPercentage = 33;

  appInsights.start();
};
