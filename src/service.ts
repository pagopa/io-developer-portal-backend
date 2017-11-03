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

const HTTP_STATUS_CONFLICT = "409";
// tslint:disable-next-line:no-any
const isConflict = (body: any) => body.title.indexOf(HTTP_STATUS_CONFLICT) >= 0;

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
  winston.debug("createService|service|", service);
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
        winston.error("createService|error|" + JSON.stringify(err));
        return reject(err);
      }
      if (res.statusCode !== 200 && !isConflict(body)) {
        winston.debug(
          "createService|error|",
          body.toString(),
          isConflict(body)
        );
        return reject(new Error(body));
      }
      winston.debug("createService|success|service exists|", isConflict(body));
      winston.debug("createService|success|", body);
      resolve({ res, body });
    });
  });
};
