import * as msRest from "ms-rest";
import * as msRestAzure from "ms-rest-azure";
import * as winston from "winston";

const subscriptionId = process.env.ARM_SUBSCRIPTION_ID as string;

process.on("unhandledRejection", e => winston.error(e));

export interface ICreds {
  readonly creds: msRest.ServiceClientCredentials;
  readonly subscriptionId: string;
}

/**
 * The following call expects MSI_ENDPOINT and MSI_SECRET
 * environment variables to be set. They don't appear
 * in the App Service settings; you can check them
 * using Kudu console.
 */
export const loginWithMsi = async () => {
  const creds = await msRestAzure.loginWithAppServiceMSI();
  return { subscriptionId, creds };
};
