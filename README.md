# Digital Citizenship - Developer portal automation facilities

This repository contains an [Express](http://expressjs.com/)
web application which implements some tasks to automate the provisioning
of users in the Digital Citizenship Azure API management *developer portal*.

The aim is to automate some operations that would otherwise
require the manual intervention of the APIs administrator:
this lets developers start testing the API just after signing-up.

User's authentication takes place against an
[Azure Active Directory B2C](https://azure.microsoft.com/en-us/services/active-directory-b2c/)
tenant.

## Automated tasks

The following tasks are triggered from the logged in users
clicking on call-to-action just after the sign-up in the developer portal:

- user is assigned to configured API management *groups*
- user gets subscribed to a configured API management *product*
- the *service* tied to the user subscription is created through the Digital Citizenship APIs
- a test profile (with a fake fiscal code) is created through the Digital Citizenship APIs
- an email is sent to the user through the Digital Citizenship APIs

The email contains the fake fiscal code so the user can start testing the API right now.
At this point he can only send messages to his own email address, which is tied to the fake profile.

## Install

### Prerequisites

- [API management instance is up and running](https://github.com/teamdigitale/digital-citizenship);
groups and products are already configured
- [Digital Citizenship Functions](https://github.com/teamdigitale/digital-citizenship-functions)
are active and related APIs are accessible through the API management
- Environment variables are correctly setup in the App Service (web application settings);
see the following steps

### Step 1 - Set up the Web Application on Azure

Deploy the code from this GitHub repository to a an Azure Web application (App service):
https://docs.microsoft.com/en-us/azure/app-service/app-service-continuous-deployment

Set up the following environment variables (application settings):
```
PORT=3000
WEBSITE_NODE_DEFAULT_VERSION=6.5.0
REPLY_URL="http://<webApplicationName>.azureweb.net/auth/openid/return"
POST_LOGIN_URL="https://<apiDeveloperPortalUrl>/developer"
POST_LOGOUT_URL="https://<apiDeveloperPortalUrl>"
COOKIE_KEY="<32 characters string...>"
COOKIE_IV="<12 characters string...>"
```

Set up the following environment variables (application settings)
needed to subscribe users to API manager products and groups:
```
ARM_SUBSCRIPTION_ID="<Azure subscription id>"
ARM_RESOURCE_GROUP="<apiManagementResourceGroupName>"
ARM_APIM="<apiManagementResourceName>"
APIM_PRODUCT_NAME="starter"
APIM_USER_GROUPS="ApiMessageWrite,ApiInfoRead"
```

### Step 2 - Add an Azure Active Directory B2C resource (ADB2C tenant)

Follow the procedure described in the documentation to create a new ADB2C tenant resource:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-get-started

Then set up the following environment variable in the App Service:
```
TENANT_ID="<tenantName>.onmicrosoft.com"
```

### Step 3 - Add an Azure Active Directory B2C sign-in / sing-up policy

Upload the file `policy/B2C_1_SignUpIn.xml` in the
Azure AD2B2C portal to create a sign-in-sign-up policy:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-reference-policies

Then set up the following environment variable in the App Service (application settings):
```
POLICY_NAME="B2C_1_SignUpIn"
```

### Step 4 - Add an Application in the Azure Active Directory B2C tenant

Register a new application in the ADB2C tenant:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-app-registration

Then set up environment variables with the application client secret (key) and id:
```
CLIENT_SECRET="<clientSecretKey>"
CLIENT_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
```

This ADB2C application is needed to check the user authentication status
(after login) and retrieve the ADB2C profile custom attributes.

### Step 5 - Activate "Managed Service Identity" for this Web application 

Navigate to the Azure Portal App Service blade (for the Web application deployed in step 1)
-> Managed Service Identity -> Register with Azure Active Directory -> set the value to 'On'.

Navigate to the Azure Portal API management blade -> Access Control (IAM) -> Add
the registered Web application as a "Contributor".

Restart the (web) App Service.

In this way we can manage developer portal users directly from the Web application
without providing any client credential; we cannot use 'CLIENT\_ID' and 'CLIENT\_SECRET'
obtained in step 4 as that client is registered in the ADB2C tenant
and is not visibile by the API manager (which is tied to the main AD tenant).

### Step 6 - Create an APIm user to access Digital Citizenship API

Create a Digital Citizenship API user running the `create_user.ts` script,
it will output the API-Key (Ocp-Apim-Subscription-Key):
```
$ ts-node src/scripts/create_user.ts
set ADMIN_API_KEY=b4YYX6fFFdXXc44b5MMMf1d28a4WWWc
```

To run the script you need to provide the following environment variables.

**Note: set up these variables only locally, before running the `create_user.ts` script;
do not set up these 3 vars in the remote App Service**:
```
ARM_CLIENT_ID="<client id of an Application registered in the main AD tenant>"
ARM_CLIENT_SECRET="<client secret / key of the Application registered in the main AD tenant>"
ARM_TENANT_ID="<AD tenant / directory id>"
```

moreover `ARM_SUBSCRIPTION_ID` must be set-up (from step 1).

Finally, set up the following variables in the App Service settings:
```
ADMIN_API_KEY="<API-key, as obtained running the script>"
ADMIN_API_URL="https://<apiManagerUrl>"
```

This is needed to let the Web application call the Digital Citizenship API,
to create a 'Service' and a 'Profile' tied to the developer portal accounts.

## Usage

1. Navigate to the developer portal -> sign-up
1. Compile the ADB2C sign-up form providing Service and Organization name
1. Click on "Subscribe to Digital Citizenship API" cta in the landing page

You should receive an API-Key (in the developer portal) and an email
with a fake fiscal code you can use to start testing the Digital Citizenship API.

## Sign-in / Sign-up form style

The `web` directory in this repository contains an HTML template & styles 
to customize the aspect of default ADB2C sign-in / sign-up pages.

Moreover it contains a page with the privacy policy which is reachable
from a link placed in the sign-in entry page.

To set up the customization:

1. deploy the HTML template & CSS to GitHub Pages running `yarn gh-pages`
1. change the ADB2C settings from the Azure Portal blade:
ADB2C -> Custom policies -> B2C_1_SignUpIn -> Edit -> Customize interface
then provide the link to the customized HTML template hosted on GitHub Pages
for `sign-in`, `sign-up`, `error` and `multifactor` pages.

