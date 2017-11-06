import * as request from "request";

import * as msRest from "ms-rest";

import { MSITokenCredentials as IMSITokenCredentials } from "ms-rest-azure";

export class MSITokenCredentials implements IMSITokenCredentials {
  private readonly resource: string;
  private readonly endpoint: string;

  constructor(options: {
    readonly endpoint: string;
    readonly resource?: string;
  }) {
    if (!options) {
      throw new Error("please provide an endpoint.");
    }

    if (typeof options.endpoint !== "string") {
      throw new Error("endpoint must be a uri.");
    }

    if (typeof options.resource !== "string") {
      throw new Error("resource must be a uri.");
    }

    // tslint:disable-next-line:no-object-mutation
    this.resource = options.resource || "https://management.azure.com/";
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
    const postUrl = process.env.MSI_ENDPOINT as string;
    const reqOptions = this.prepareRequestOptions();
    request.post(postUrl, reqOptions, (err, _, body) => {
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
    });
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

  private prepareRequestOptions(): {} {
    const resource = encodeURIComponent(this.resource);
    return {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Metadata: "true"
      },
      body: `resource=${resource}`
    };
  }
}
