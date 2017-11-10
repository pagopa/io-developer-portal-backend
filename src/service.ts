/**
 * Creates a new Service tied to the user subscription
 * in the API management resource.
 */
import * as request from "request";
import * as winston from "winston";
import * as config from "./config";

import { none, Option, some } from "ts-option";

export interface IServicePayload {
  readonly service_name: string;
  readonly department_name: string;
  readonly organization_name: string;
  readonly service_id: string;
  readonly authorized_recipients: ReadonlyArray<string>;
}

const HTTP_STATUS_CONFLICT = "409";
const isConflict = (body: { readonly title: string }) =>
  body.title && body.title.indexOf(HTTP_STATUS_CONFLICT) >= 0;

/**
 * RESTful call to Digital Citizenship API
 *  that creates a new Service for the current logged-in user.
 */
export const createService = (apiKey: string, service: IServicePayload) => {
  return new Promise(async (resolve, reject) => {
    const maybeService = await getService(apiKey, service.service_id);
    const options = {
      uri: `${config.adminApiUrl}/adm/services`,
      method: maybeService.isEmpty ? "POST" : "PUT",
      json: service,
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey
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
          JSON.stringify(body),
          isConflict(body)
        );
        return reject(new Error(body));
      }
      winston.debug(
        "createService|success|service is new = ",
        !isConflict(body)
      );
      winston.debug("createService|success|", body);
      resolve({ res, body });
    });
  });
};

export const getService = (
  apiKey: string,
  serviceId: string
): Promise<Option<{}>> => {
  return new Promise((resolve, reject) => {
    const options = {
      uri: `${config.adminApiUrl}/adm/services/${serviceId}`,
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey
      }
    };
    request(options, (err, res, body) => {
      if (err) {
        winston.error("getService|error|" + JSON.stringify(err));
        return reject(err);
      }
      if (res.statusCode === 404) {
        return resolve(none);
      }
      if (res.statusCode !== 200) {
        winston.debug("getService|error|", JSON.stringify(body));
        return reject(new Error(body));
      }
      winston.debug("getService|success|", body);
      resolve(some(body));
    });
  });
};
