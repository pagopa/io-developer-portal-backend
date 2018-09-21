import * as request from "request";
import * as config from "./config";
import { logger } from "./logger";

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
  apiKey: string,
  fakeFiscalCode: string,
  message: IMessagePayload
) => {
  logger.debug("sendMessage|message|", message);
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey
      },
      json: message,
      method: "POST",
      uri: `${config.adminApiUrl}/api/v1/messages/${fakeFiscalCode}`
    };
    request(options, (err, res, body) => {
      if (err) {
        logger.error("sendMessage|error|" + JSON.stringify(err));
        return reject(err);
      }
      if (res.statusCode !== 201) {
        logger.debug("sendMessage|error|", JSON.stringify(body));
        return reject(new Error(body));
      }
      logger.debug("sendMessage|success|", body);
      resolve({ res, body });
    });
  });
};
