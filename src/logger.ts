/**
 * Winston logger shared configuration.
 */
import * as appinsights from "applicationinsights";
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
      appinsights.defaultClient.trackTrace({
        message,
        severity: getSeverityLevel(nfo.level)
      });
      return message;
    })
  ),
  transports: [new transports.Console({ level: config.logLevel || "info" })]
});

function getSeverityLevel(level: string): appinsights.Contracts.SeverityLevel {
  switch (level) {
    case "error":
      return appinsights.Contracts.SeverityLevel.Error;
    case "warn":
      return appinsights.Contracts.SeverityLevel.Warning;
    case "info":
      return appinsights.Contracts.SeverityLevel.Information;
    case "verbose":
    case "debug":
      return appinsights.Contracts.SeverityLevel.Verbose;
    default:
      return appinsights.Contracts.SeverityLevel.Information;
  }
}

export const startAppInsights = () => {
  // collect monotoring metrics automatically
  appinsights
    .setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
    .setAutoCollectConsole(false) // Disabilita la raccolta automatica dei log
    .setDistributedTracingMode(appinsights.DistributedTracingModes.AI_AND_W3C);

  // tslint:disable-next-line: no-object-mutation
  appinsights.defaultClient.config.samplingPercentage = 33;

  appinsights.start();
};
