/**
 * Creates a new Fake Profile (CF)
 * using Digital Citizenship API.
 */
import * as randomstring from "randomstring";
import * as request from "request";
import * as config from "./config";
import { logger } from "./logger";

export interface IProfilePayload {
  readonly email: string;
  readonly version: number;
}

/**
 * Generate fake fiscal code for testing.
 *
 * Local codes starts with [A-M]
 * so by using `Y` the generated fiscal code
 * won't conflict with any real one.
 * May conflict with existing test fiscal codes
 * with a low probability.
 */
export const generateFakeFiscalCode = () => {
  const s = randomstring.generate({
    capitalization: "uppercase",
    charset: "alphabetic",
    length: 6
  });
  const d = randomstring.generate({
    charset: "numeric",
    length: 7
  });
  return [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join("");
};

/**
 * RESTful call to Digital Citizenship API
 *  that creates a new fake Profile.
 */
export const createFakeProfile = (
  apiKey: string,
  profile: IProfilePayload
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const fakeFiscalCode = generateFakeFiscalCode();
    const options = {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey
      },
      json: profile,
      method: "POST",
      uri: `${config.adminApiUrl}/api/v1/profiles/${fakeFiscalCode}`
    };
    logger.debug("createFakeProfile|profile|", profile, options.uri);
    request(options, (err, res, body) => {
      if (err) {
        logger.error("createFakeProfile|error|" + JSON.stringify(err));
        return reject(err);
      }
      if (res.statusCode !== 200) {
        logger.debug("createFakeProfile|error|" + JSON.stringify(body));
        return reject(new Error(body));
      }
      logger.debug("createFakeProfile|success|", body);
      resolve(fakeFiscalCode);
    });
  });
};
