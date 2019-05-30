"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Winston logger shared configuration.
 */
const logform = require("logform");
const winston_1 = require("winston");
const config = require("./config");
const { timestamp, printf } = logform.format;
exports.logger = winston_1.createLogger({
    format: winston_1.format.combine(timestamp(), winston_1.format.splat(), winston_1.format.simple(), printf(nfo => {
        return `${nfo.timestamp} [${nfo.level}]: ${nfo.message}`;
    })),
    transports: [new winston_1.transports.Console({ level: config.logLevel || "info" })]
});
//# sourceMappingURL=logger.js.map