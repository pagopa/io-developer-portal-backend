# Digital Citizenship - Developer portal automation facilities

This repository contains an [Express](http://expressjs.com/)
web application which implements some tasks to automate the provisioning
of users in the Digital Citizenship Azure API management *developer portal*.

The aim is to automate some operations that would otherwise
require the manual intervention of the APIs administrator:
this lets the developers start testing the API just after signing-up.

Users' authentication takes place against an
[Azure Active Directory B2C](https://azure.microsoft.com/en-us/services/active-directory-b2c/)
tenant.

## Automated tasks

The following tasks are triggered from the logged in users
clicking on call-to-action just after the sign-up in the developer portal:

- user is assigned to configured API management *groups*
- user gets subscribed to a configured API management *product*
- the *service* tied to the user subscription is created through the Digital Citizenship APIs

## Install

### Prerequisites

- [API management instance is up and running](https://github.com/teamdigitale/digital-citizenship);
groups and products are already configured
- [Digital Citizenship Functions](https://github.com/teamdigitale/digital-citizenship-functions)
are active and related APIs are accessible through the API management
- Environment variables are correctly setup in the App Service (web application settings);
see the following steps

### Step 1 - Set up the Web Application on Azure

Deploy the code from this GitHub repository to a an Azure Web application:
https://docs.microsoft.com/en-us/azure/app-service/app-service-continuous-deployment

Set up the following environment variables:

```
PORT=3000
WEBSITE_NODE_DEFAULT_VERSION=6.5.0
```

Where to receive logged in ADB2C user's claims after login in:
```
REPLY_URL="http://<webApplicationName>.azureweb.net/auth/openid/return"
```

Where to redirect the user after assigning products, groups and service:
```
POST_LOGIN_URL="https://<apiDeveloperPortalUrl>/developer"
```

Where to redirect user after a user log out:
```
POST_LOGOUT_URL="https://<apiDeveloperPortalUrl>"
```

Needed to encrypt / decrypt cookies:
```
COOKIE_KEY="<32 characters string...>"
COOKIE_IV="<12 characters string...>"
```

### Step 2 - Add an Azure Active Directory B2C resource (ADB2C tenant)

Follow the procedure described in the documentation to create a new ADB2C tenant resource:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-get-started

Then set up the following environment variable in the App Service:
```
TENANT_ID="<tenantName>.onmicrosoft.com"
```

### Step 3 - Add an Azure Active Directory B2C sign-in / sing-up policy

Set up an ADB2C Policy for sign-up / sign-in users as described in the documentation:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-reference-policies

Then set up the following environment variable in the App Service:
```
POLICY_NAME="B2C_1_<policyName>"
```

### Step 4 - Add an Application in the Azure Active Directory B2C tenant

Register a new application in the ADB2C tenant:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-app-registration

Then set up environment variables with the application client secret (key) and id:
```
CLIENT_SECRET="<clientSecretKey>"
CLIENT_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
```

### Step 5 - Activate Managed Service Identity for the Web application 

Navigate to the Azure Portal App Service blade for the Web application (App Service)
-> Managed Service Identity -> Register with Azure Active Directory
and set the value to 'On'.

Navigate to the Azure Portal API management blade -> Access Control (IAM) -> Add
and add the registered Web application as a Contributor.

Set up the AD tenant subscription id environment variable in the Web application (App Service) instance;
needed to use ARM APIs to manage API Manager users' subscriptions:
```
ARM_SUBSCRIPTION_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
```

Restart the (web) App Service.

### Step 6 - Set up variables related to the API management resource

Set up the following environment variables in the App Service instance:

```
ARM_RESOURCE_GROUP="<resourceGroupName>"
ARM_APIM="<apiManagerResourceName>"
```

Needed to subscribe users to API manager product and groups:
```
APIM_PRODUCT_NAME="starter"
APIM_USER_GROUPS="ApiMessageWrite,ApiInfoRead"
```

### Step 7 - Set up variables related to Functions (Digital Citizenship API)

These are needed to create a Service, linked to the user's subscription,
using the Functions API:
```
ADMIN_API_KEY="<ocm-Api-Subscription-Key>"
ADMIN_API_URL="https://<apiManagerUrl>/adm"
```

The API-Key must belong to an API management user
assigned to the `ApiServiceWrite` group.

## Usage

1. Navigate to the developer portal
1. Sign-up as a new user; provide Service and Organization name in the sign-up form
1. Click on "Subscribe to Digital Citizenship API" cta in the landing page
