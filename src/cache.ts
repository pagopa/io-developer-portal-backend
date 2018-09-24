import memProfile = require("memoizee/profile");
import { logger } from "./logger";

export function initCacheStats(): void {
  setInterval(() => {
    logger.debug(memProfile.log());
  }, 10000);
}
