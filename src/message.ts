/**
 * Creates a new Fake Profile (CF)
 * using Digital Citizenship API.
 */
import * as request from "request";
import * as winston from "winston";
import * as config from "./config";

export interface IMessagePayload {
  readonly content: {
    readonly subject: string;
    readonly markdown: string;
  };
}

/**
 * RESTful call to Digital Citizenship API
 * that send a new message to new user (fake profile).
 */
export const sendMessage = (
  fakeFiscalCode: string,
  message: IMessagePayload
) => {
  winston.debug("sendMessage|message|", message);
  return new Promise((resolve, reject) => {
    const options = {
      uri: `${config.adminApiUrl}/api/v1/messages/${fakeFiscalCode}`,
      method: "POST",
      json: message,
      headers: {
        "Ocp-Apim-Subscription-Key": config.adminApiKey
      }
    };
    request(options, (err, res, body) => {
      if (err) {
        winston.error("sendMessage|error|" + JSON.stringify(err));
        return reject(err);
      }
      if (res.statusCode !== 200) {
        winston.debug("sendMessage|error|", JSON.stringify(body));
        return reject(new Error(body));
      }
      winston.debug("sendMessage|success|", body);
      resolve({ res, body });
    });
  });
};
