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

To install the web application refer to the installation manual here:  
https://github.com/teamdigitale/io

## Usage

1. Navigate to the developer portal -> sign-up
1. Compile the ADB2C sign-up form providing Service and Organization name
1. Click on "Subscribe to Digital Citizenship API" cta in the landing page

You should receive an API-Key (in the developer portal) and an email
with a fake fiscal code you can use to start testing the Digital Citizenship API.

## ADB2C Sign-in / Sign-up form style

The `web` directory in this repository contains an HTML template & CSS styles 
to customize the aspect of default ADB2C sign-in / sign-up pages.

Moreover it contains a page with the privacy policy which is reachable
from a link placed in the sign-in entry page.

To set up the customization:

1. deploy the HTML template & CSS to GitHub Pages  
```
yarn gh-pages
```
1. refer to the installation manual to customize the sign-up / sign-in forms:  
https://github.com/teamdigitale/io
