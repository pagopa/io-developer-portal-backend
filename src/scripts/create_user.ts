/**
 * This is a command line script that you can run to create
 * a new API management user that has the rights to 
 * create a new service (through Admin API) and to send
 * a new message (throught Digital Citizenship API).
 *
 * Once created, the API-Key for the user subscription will be written 
 * to standard output.
 *
 */
import * as dotenv from "dotenv";
/*
 * Useful for testing the web application locally.
 * 'local.env' file does not need to exists in the
 * production environment (use Application Settings instead)
 */
dotenv.config({ path: __dirname + "/../../local.env" });

import * as config from "../config";

import { IUserData, updateApimUser } from "../account";
import { createService } from "../service";

import * as winston from "winston";

import apiManagementClient = require("azure-arm-apimanagement");
import * as msRestAzure from "ms-rest-azure";

const localConfig = {
  ...config,
  armClientId: process.env.ARM_CLIENT_ID as string,
  armClientSecret: process.env.ARM_CLIENT_SECRET as string,
  armTenantId: process.env.ARM_TENANT_ID as string
};

winston.configure({
  transports: [
    new winston.transports.Console({ level: config.logLevel || "info" })
  ]
});

const checkConfig = (conf: typeof localConfig) =>
  [
    conf.adminApiUrl,
    conf.armClientId,
    conf.armClientSecret,
    conf.armTenantId,
    conf.subscriptionId
  ].every(v => v !== undefined && v !== null && v !== "");

const createAdminUser = async (conf: typeof localConfig) => {
  const userData: IUserData = {
    oid: "azure-deploy",
    firstName: "azure",
    lastName: "deploy",
    email: "apim-deploy@agid.gov.it",
    productName: conf.apimProductName,
    groups: ["ApiProfileWrite", "ApiMessageWrite", "ApiServiceWrite"]
  };
  const creds = await msRestAzure.loginWithServicePrincipalSecret(
    localConfig.armClientId,
    localConfig.armClientSecret,
    localConfig.armTenantId
  );

  const apiClient = new apiManagementClient(creds, localConfig.subscriptionId);

  const user = await apiClient.user.createOrUpdate(
    config.azurermResourceGroup,
    config.azurermApim,
    userData.oid,
    {
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName
    }
  );

  if (!user || !user.name) {
    throw new Error("Cannot create new user");
  }

  const subscription = await updateApimUser(user.name, userData, creds, true);

  if (!subscription || !subscription.name) {
    throw new Error("Cannot create subscription");
  }

  await createService(subscription.primaryKey, {
    authorized_recipients: [],
    department_name: "IT",
    organization_name: "AgID",
    service_id: subscription.name,
    service_name: "Digital Citizenship"
  });

  return subscription.primaryKey;
};

if (!checkConfig(localConfig)) {
  throw new Error("missing env variable\n" + JSON.stringify(localConfig));
}

createAdminUser(localConfig)
  // tslint:disable-next-line
  .then(key => console.log("set ADMIN_API_KEY=" + key))
  .catch(console.error);
