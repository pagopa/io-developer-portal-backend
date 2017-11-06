import * as request from "request";

import * as msRest from "ms-rest";

import { MSITokenCredentials as IMSITokenCredentials } from "ms-rest-azure";

const API_VERSION = "2017-09-01";

export class MSITokenCredentials implements IMSITokenCredentials {
  private readonly resource: string;
  private readonly endpoint: string;
  private readonly secret: string;

  constructor(options: {
    readonly endpoint: string;
    readonly secret: string;
    readonly resource?: string;
  }) {
    if (!options) {
      throw new Error("please provide an endpoint.");
    }
    if (typeof options.endpoint !== "string") {
      throw new Error("endpoint must be a uri.");
    }
    if (typeof options.secret !== "string") {
      throw new Error("secret must be set.");
    }
    if (typeof options.resource !== "string") {
      // tslint:disable-next-line:no-object-mutation
      this.resource = "https://management.azure.com/";
    } else {
      // tslint:disable-next-line:no-object-mutation
      this.resource = options.resource;
    }
    // tslint:disable-next-line:no-object-mutation
    this.secret = options.secret;
    // tslint:disable-next-line:no-object-mutation
    this.endpoint = options.endpoint;
  }

  /**
   * Prepares and sends a POST request to a service endpoint hosted on the Azure VM, which responds with the access token.
   * @param  {function} callback  The callback in the form (err, result)
   * @return {function} callback
   *                       {Error} [err]  The error if any
   *                       {object} [tokenResponse] The tokenResponse (token_type and access_token are the two important properties). 
   */

  public getToken(
    callback: (
      error: Error,
      result: { readonly token_type: string; readonly access_token: string }
    ) => void
  ): void {
    const query = `?resource=${this.resource}&api-version=${API_VERSION}`;
    request.get(
      this.endpoint + query,
      {
        headers: {
          Secret: this.secret
        }
      },
      (err, _, body) => {
        if (err) {
          // tslint:disable-next-line
          return callback(err, undefined as any);
        }
        try {
          const tokenResponse = JSON.parse(body);
          if (!tokenResponse.token_type) {
            throw new Error(
              `Invalid token response, did not find token_type. Response body is: ${body}`
            );
          } else if (!tokenResponse.access_token) {
            throw new Error(
              `Invalid token response, did not find access_token. Response body is: ${body}`
            );
          }
          // tslint:disable-next-line
          return callback(undefined as any, tokenResponse);
        } catch (error) {
          // tslint:disable-next-line
          return callback(error, undefined as any);
        }
      }
    );
  }

  public signRequest(
    webResource: msRest.WebResource,
    callback: (err: Error) => void
  ): void {
    this.getToken((err, result) => {
      if (!result || err) {
        return callback(err);
      }
      // tslint:disable-next-line
      (webResource as any).headers[
        // tslint:disable-next-line
        "authorization"
      ] = `${result.token_type} ${result.access_token}`;
      // tslint:disable-next-line
      return callback(undefined as any);
    });
  }
}
