import * as msRest from "ms-rest";
import * as msRestAzure from "ms-rest-azure";
import * as winston from "winston";

const subscriptionId = process.env.ARM_SUBSCRIPTION_ID as string;

// const msiPort =
//   typeof process.env.MSI_PORT === "string"
//     ? Number(process.env.MSI_PORT)
//     : 50342;

process.on("unhandledRejection", e => winston.error(e));

export interface ICreds {
  readonly creds: msRest.ServiceClientCredentials;
  readonly subscriptionId: string;
}

export const loginWithMsi = async () => {
  const creds = await msRestAzure.loginWithMSI();
  return { creds, subscriptionId };
};
