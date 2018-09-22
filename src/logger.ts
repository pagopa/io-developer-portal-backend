/**
 * Winston logger shared configuration.
 */
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
      return `${nfo.timestamp} [${nfo.level}]: ${nfo.message}`;
    })
  ),
  transports: [new transports.Console({ level: config.logLevel || "info" })]
});
