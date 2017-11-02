/**
 * Creates a new service.
 */
"use strict";

import * as request from "request";
import * as winston from "winston";
import * as config from "./local.config";

export interface IServicePayload {
  readonly service_name: string;
  readonly department_name: string;
  readonly organization_name: string;
  readonly service_id: string;
  readonly authorized_recipients: ReadonlyArray<string>;
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
  winston.log("info", "createService");
  return new Promise((resolve, reject) => {
    const options = {
      uri: `${config.admin_api_url}/services`,
      method: "POST",
      json: service,
      headers: {
        "Ocp-Apim-Subscription-Key": config.admin_api_key
      }
    };
    request(options, (err, res, body) => {
      if (err) {
        winston.log("debug", "createService|error|" + JSON.stringify(err));
        return reject(err);
      }
      resolve({ res, body });
    });
  });
};
