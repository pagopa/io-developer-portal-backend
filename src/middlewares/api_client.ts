/**
 * Middleware that get a new Azure API management client
 * authenticated using MSI.
 */
import ApiManagementClient from "azure-arm-apimanagement";
import { right } from "fp-ts/lib/Either";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ITokenAndCredentials, loginToApim } from "../apim_operations";
import * as config from "../config";
import { IJiraAPIClient, JiraAPIClient } from "../jira_client";

// Global var needed to cache the
// API management access token between calls
// tslint:disable-next-line:no-let
let tokenCreds: ITokenAndCredentials;

export function getApiClientMiddleware(): IRequestMiddleware<
  never,
  ApiManagementClient
> {
  return async _ => {
    tokenCreds =
      // note that only a literal "1" will activate
      // the login procedure using the configured service principal;
      // env values like "true" won't work here
      config.useServicePrincipal === "1" &&
      config.servicePrincipalClientId &&
      config.servicePrincipalSecret &&
      config.servicePrincipalTenantId
        ? await loginToApim(tokenCreds, {
            servicePrincipalClientId: config.servicePrincipalClientId,
            servicePrincipalSecret: config.servicePrincipalSecret,
            servicePrincipalTenantId: config.servicePrincipalTenantId
          })
        : await loginToApim(tokenCreds);
    return right(
      new ApiManagementClient(tokenCreds.loginCreds, config.subscriptionId)
    );
  };
}

export function getJiraClientMiddleware(
  jiraConfig: config.IJIRA_CONFIG
): IRequestMiddleware<"IResponseErrorInternal", IJiraAPIClient> {
  return async _ =>
    right(
      JiraAPIClient(jiraConfig.JIRA_NAMESPACE_URL, {
        boardId: jiraConfig.JIRA_BOARD,
        delegateIdField: jiraConfig.JIRA_DELEGATE_ID_FIELD,
        emailIdField: jiraConfig.JIRA_EMAIL_ID_FIELD,
        jiraEmail: jiraConfig.JIRA_USERNAME,
        organizationIdField: jiraConfig.JIRA_ORGANIZATION_ID_FIELD,
        statusComplete: jiraConfig.JIRA_STATUS_COMPLETE,
        token: jiraConfig.JIRA_TOKEN
      })
    );
}
