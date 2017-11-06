import * as msRest from "ms-rest";
import * as winston from "winston";

/**
 * We cannot use loginWithMSI()
 * see https://github.com/Azure/azure-sdk-for-node/issues/2292
 */
import { MSITokenCredentials } from "./msi_token_credentials";

const subscriptionId = process.env.ARM_SUBSCRIPTION_ID as string;
const endpoint = process.env.MSI_ENDPOINT as string;
const secret = process.env.MSI_SECRET as string;

process.on("unhandledRejection", e => winston.error(e));

export interface ICreds {
  readonly creds: msRest.ServiceClientCredentials;
  readonly subscriptionId: string;
}

export const loginWithMsi = (): Promise<ICreds> => {
  return new Promise((resolve, reject) => {
    const creds = new MSITokenCredentials({
      endpoint,
      secret
    });
    creds.getToken(err => {
      if (err) {
        return reject(err);
      }
      return resolve({ creds, subscriptionId });
    });
  });
};
