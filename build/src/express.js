"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const helmet = require("helmet");
const csp = require("helmet-csp");
const referrerPolicy = require("referrer-policy");
/**
 * Set up secure HTTP headers applying middlewares
 * to the express application passed in input.
 *
 * @param app an express application.
 */
function secureExpressApp(app) {
    // Set header `referrer-policy` to `no-referrer`
    app.use(referrerPolicy());
    // Set up Content Security Policy
    app.use(csp({
        directives: {
            defaultSrc: ["'none'"],
            upgradeInsecureRequests: true
        }
    }));
    // Set up the following HTTP headers
    // (see https://helmetjs.github.io/ for default values)
    //    strict-transport-security: max-age=15552000; includeSubDomains
    //    transfer-encoding: chunked
    //    x-content-type-options: nosniff
    //    x-dns-prefetch-control: off
    //    x-download-options: noopen
    //    x-frame-options: DENY
    //    x-xss-protection →1; mode=block
    app.use(helmet({
        frameguard: {
            action: "deny"
        }
    }));
}
exports.secureExpressApp = secureExpressApp;
//# sourceMappingURL=express.js.map