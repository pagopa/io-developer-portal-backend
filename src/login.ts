import * as msRest from "ms-rest";
import * as winston from "winston";

/**
 * We cannot use loginWithMSI()
 * see https://github.com/Azure/azure-sdk-for-node/issues/2292
 */
import { MSITokenCredentials } from "./msi_token_credentials";

const subscriptionId = process.env.ARM_SUBSCRIPTION_ID as string;

process.on("unhandledRejection", e => winston.error(e));

export interface ICreds {
  readonly creds: msRest.ServiceClientCredentials;
  readonly subscriptionId: string;
}

export const loginWithMsi = async () => {
  const creds = new MSITokenCredentials({
    endpoint: process.env.MSI_ENDPOINT as string
  });
  return { creds, subscriptionId };
};
