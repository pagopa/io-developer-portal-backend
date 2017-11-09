/**
 * Creates a new Fake Profile (CF)
 * using Digital Citizenship API.
 */
import * as randomstring from "randomstring";
import * as request from "request";
import * as winston from "winston";
import * as config from "./config";

export interface IProfilePayload {
  readonly email: string;
}

const HTTP_STATUS_CONFLICT = "409";
const isConflict = (body: { readonly title: string }) =>
  body.title && body.title.indexOf(HTTP_STATUS_CONFLICT) >= 0;

/**
 * Generate fake fiscal code for testing.
 * 
 * Local codes starts with [A-M]
 * so by using `Y` the generated fiscal code 
 * won't conflict with any real one.
 * May conflict with existing test fiscal codes
 * with a low probability.
 */
const generateFakeFiscalCode = () => {
  const s = randomstring.generate({
    length: 6,
    capitalization: "uppercase",
    charset: "alphabetic"
  });
  const d = randomstring.generate({
    length: 7,
    charset: "numeric"
  });
  return [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join();
};

/**
 * RESTful call to Digital Citizenship API
 *  that creates a new fake Profile.
 */
export const createFakeProfile = (profile: IProfilePayload) => {
  winston.debug("createFakeProfile|profile|", profile);
  return new Promise((resolve, reject) => {
    const fakeFiscalCode = generateFakeFiscalCode();
    const options = {
      uri: `${config.adminApiUrl}/profiles/${fakeFiscalCode}`,
      method: "POST",
      json: profile,
      headers: {
        "Ocp-Apim-Subscription-Key": config.adminApiKey
      }
    };
    request(options, (err, res, body) => {
      if (err) {
        winston.error("createProfile|error|" + JSON.stringify(err));
        return reject(err);
      }
      if (res.statusCode !== 200 && !isConflict(body)) {
        winston.debug(
          "createProfile|error|",
          JSON.stringify(body),
          isConflict(body)
        );
        return reject(new Error(body));
      }
      winston.debug(
        "createProfile|success|profile exists = ",
        isConflict(body)
      );
      winston.debug("createProfile|success|", body);
      resolve({ res, body });
    });
  });
};
