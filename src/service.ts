/**
 * Creates a new service.
 */
"use strict";

import * as config from "./local.config";
import * as request from "request";

export interface IServicePayload {
  service_name: string;
  department_name: string;
  organization_name: string;
  service_id: string;
  authorized_recipients: string[];
}

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
export const createService = (service: IServicePayload) => {
  return new Promise((resolve, reject) => {
    const options = {
      uri: `${config.admin_api_url}/services`,
      method: "POST",
      json: service,
      headers: {
        "Ocp-Apim-Subscription-Key": config.api_key
      }
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
