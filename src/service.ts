/**
 * Creates a new Service tied to the user subscription
 * in the API management resource.
 */
import * as request from "request";
import * as winston from "winston";
import * as config from "./config";

export interface IServicePayload {
  readonly service_name: string;
  readonly department_name: string;
  readonly organization_name: string;
  readonly organization_fiscal_code: string;
  readonly service_id: string;
  readonly authorized_recipients: ReadonlyArray<string>;
  readonly authorized_cidrs: ReadonlyArray<string>;
}

/**
 * RESTful call to Digital Citizenship API
 *  that creates a new Service for the current logged-in user.
 */
export const upsertService = (apiKey: string, service: IServicePayload) => {
  return new Promise(async (resolve, reject) => {
    const maybeService = await getService(apiKey, service.service_id);
    winston.debug("upsertService|getService", JSON.stringify(maybeService));
    const options = {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey
      },
      json: service,
      method: maybeService.isEmpty ? "POST" : "PUT",
      uri: `${config.adminApiUrl}/adm/services${
        maybeService.isEmpty ? "" : "/" + service.service_id
      }`
    };
    request(options, (err, res, body) => {
      if (err) {
        winston.error("createService|error|" + JSON.stringify(err));
        return reject(err);
      } else if (res.statusCode !== 200) {
        winston.debug("createService|error|", JSON.stringify(body));
        return reject(new Error(body));
      } else {
        winston.debug("createService|success|", body);
        resolve({ res, body });
      }
    });
  });
};

export const getService = (
  apiKey: string,
  serviceId: string
  // tslint:disable-next-line:no-any
): Promise<any | undefined> => {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey
      },
      json: true,
      method: "GET",
      uri: `${config.adminApiUrl}/adm/services/${serviceId}`
    };
    winston.debug("getService|serviceId|" + serviceId);
    request(options, (err, res, body) => {
      winston.debug(
        "getService|response|" + JSON.stringify(err) + JSON.stringify(body)
      );
      if (err) {
        winston.error("getService|error|" + JSON.stringify(err));
        return reject(err);
      } else if (res.statusCode === 404) {
        return undefined;
      } else if (res.statusCode !== 200) {
        winston.debug("getService|error|" + JSON.stringify(body));
        return reject(new Error(body));
      } else {
        winston.debug("getService|success|" + JSON.stringify(body));
        resolve(body);
      }
    });
  });
};
