# Digital Citizenship - Developer portal facilities

## Quick Start

### Step 1 - Deploy the code from this GitHub repository to a an Azure Web application

You need to set up the following environment variables:

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

### Step 2 - Add an Azure Active Directory B2C resource (aka, tenant)

Follow the procedure described in the documentation here to create a new ADB2C tenant resource:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-get-started

Then set up the following environment variable:
```
TENANT_ID="<tenantName>.onmicrosoft.com"
```

### Step 3 - Add an Azure Active Directory B2C policy

Set up an ADB2C Policy for sign-up / sign-in users as described in the documentation:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-reference-policies

Then set up the following environment variable:
```
POLICY_NAME="B2C_1_<policyName>"
```

### Step 4 - Add an Azure Active Directory B2C application

Register a new application in the ADB2C tenant:
https://docs.microsoft.com/en-us/azure/active-directory-b2c/active-directory-b2c-app-registration

Then set up environment variables with the application client secret (key) and id:
```
CLIENT_SECRET="<clientSecretKey>"
CLIENT_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
```

### Step 5 - Register an application in the main Azure Active Directory tenant

Set up environment variables with the credentials of the application belonging
to the *main* AD tenant (**not** the ADB2C one !).

These are needed to use ARM APIs to manage API Manager users' subscriptions:
```
ARM_CLIENT_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
ARM_CLIENT_SECRET="<adClientSecret>"
ARM_TENANT_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
ARM_SUBSCRIPTION_ID="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX"
```

### Step 6 - Set up API manager resource and settings
```
ARM_RESOURCE_GROUP="<resourceGroupName>"
ARM_APIM="<apiManagerResourceName>"
```

Needed to subscribe users to API manager product and groups:
```
APIM_PRODUCT_NAME="starter"
APIM_USER_GROUPS="ApiMessageWrite,ApiInfoRead"
```

These are needed to create a Service, linked to the user's subscription,
using the Functions API:
```
ADMIN_API_KEY="<ocm-Api-Subscription-Key>"
ADMIN_API_URL="https://<apiManagerUrl>/adm"
```
