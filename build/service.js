/**
 * Creates a new service.
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("./local.config");
const request = require("request");
/**
 * Creates a service for the user's organization.
 *
 * @param service
 * {
 *    service_name: "aService",
 * 	  department_name: "aDepartment",
 * 	  organization_name: "anOrganization",
 * 	  service_id: "aSubscriptionId",
 * 	  authorized_recipients: ['AFISCALCODE', 'ANOTHERFISCALCODE' ]
 * }
 */
const createService = (service) => {
    return new Promise((resolve, reject) => {
        const options = {
            uri: `${config.admin_api_url}/services`,
            method: "POST",
            json: service
        };
        request(options, (err, res, body) => {
            if (err) {
                return reject(err);
            }
            resolve({ res, body });
        });
    });
};
module.exports = { createService };
//# sourceMappingURL=service.js.map