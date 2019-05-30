"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memProfile = require("memoizee/profile");
const logger_1 = require("./logger");
function initCacheStats() {
    setInterval(() => {
        logger_1.logger.debug(memProfile.log());
    }, 10000);
}
exports.initCacheStats = initCacheStats;
//# sourceMappingURL=cache.js.map