/**
 * Winston logger shared configuration.
 */
import * as appInsights from "applicationinsights";
import { Writable } from "stream";
import { createLogger, format, Logger, transports } from "winston";

// Configura Application Insights
if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
  appInsights
    .setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
    .setAutoCollectConsole(false)
    .start();
}
const aiClient = appInsights.defaultClient;

// Crea un trasporto personalizzato per Application Insights
const appInsightsTransport = new transports.Stream({
  level: "info", // Imposta il livello minimo del log a 'info'
  stream: new Writable({
    write: (message: string) => {
      const info = JSON.parse(message);
      aiClient.trackTrace({
        message: info.message,
        severity: convertLevelToAISeverity(info.level)
      });
    }
  })
});

// Funzione per convertire il livello di log di Winston in livelli di severità di Application Insights
function convertLevelToAISeverity(level: string): number {
  switch (level) {
    case "error":
      return appInsights.Contracts.SeverityLevel.Error;
    case "warn":
      return appInsights.Contracts.SeverityLevel.Warning;
    case "info":
      return appInsights.Contracts.SeverityLevel.Information;
    default:
      return appInsights.Contracts.SeverityLevel.Verbose;
  }
}

// Configura il logger di Winston
export const logger: Logger = createLogger({
  format: format.combine(
    format.json(), // Usa il formato JSON per i messaggi
    format.timestamp()
  ),
  transports: [
    appInsightsTransport,
    new transports.Console() // Puoi mantenere questo se vuoi che i log siano mostrati anche in console
  ]
});
