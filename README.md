# IO developer portal backend (developer portal automation facilities)

This repository contains an [Express](http://expressjs.com/) web application that implements some tasks to automate the users' provisioning in the IO Azure API management *developer portal*.

The goal is to automate some operations that would otherwise require the manual intervention of the APIs administrator: this lets developers start testing the API just after signing-up.

User's authentication takes place against an [Azure Active Directory B2C](https://azure.microsoft.com/en-us/services/active-directory-b2c/) tenant.

## Automated tasks

The following tasks are triggered from the logged in users clicking on call-to-action just after the sign-up in the developer portal:

* The user is assigned to the API management *groups* configured

* The user is subscribed to the API management *product* configured

* The *service* tied to the user subscription is created through the Digital Citizenship APIs

* A test profile (with a fake fiscal code) is created through the Digital Citizenship APIs

* An email is sent to the user through the Digital Citizenship APIs. The email contains the fake fiscal code, so that the user can start testing the API right away. At this point, users can only send messages to their own email address, which is tied to the fake profile created.

## Test the application locally

The application can be tested locally, either on the developer host machine (using dev tools, such as *npm* and *yarn*), or using Docker.

Both a `Dockerfile` and a `docker-compose.yaml` files are in the root of this repository.

To build the local test environment using Docker, copy the *.env.demo* file in this repository and rename it into *.env*. Customize it with your values. Then, run:

```shell
docker-compose up -d
```

Then, access the application at `http://localhost:8080`.

To bring down the Docker test environment and remove the container, use

```shell
docker-compose down
```

## Deployment

The application can be deployed either as an *Azure application service* or as a stand-alone container, running for example on top of Kubernetes.

### Docker/Kubernetes deployment

At each change, a Docker image is automatically produced (and tagged) on DockerHub. The image is public and can be consumed for application deployments.

For more informations about IO application deployments on Kubernetes check [this](https://github.com/teamdigitale/io-infrastructure-post-config) out.

### Azure AppService deployment

The paragraph explains how to deploy the application as an Azure AppService Deployment. The instructions assume that the app service has been already created and configured to support the application.

>NOTE: The application is now deployed on the *apim-portal-prod* AppService on Azure. The following code snippets assume that *apim-portal-prod* is the AppService name.

The application can deployed by pushing it to the git repository linked to the AppService. Git credentials can be got using:

```
$ az webapp deployment list-publishing-credentials --resource-group apim-portal --name apim-portal-prod
```

Then to deploy the  application:

```shell
$ git remote add production https://apim-portal-prod.scm.azurewebsites.net:443/apim-portal-prod.git
$ git push production
```

## Usage

* Navigate to the developer portal -> sign-up

* Compile the ADB2C sign-up form providing Service and Organization name

* Click on "Subscribe to Digital Citizenship API" cta in the landing page

You should receive an API-Key (in the developer portal) and an email with a fake fiscal code that you can use to start testing the Digital Citizenship API.

## ADB2C Sign-in / Sign-up form style

The *web* directory in this repository contains an HTML template and some CSS styles to customize the aspect of both the ADB2C sign-in and sign-up default pages.

Moreover, it contains a page with the privacy policy which is reachable from a link placed in the sign-in entry page.

To set up the customization:

* Deploy the HTML template and CSSs to GitHub Pages

```shell
yarn gh-pages
```

* Refer to the [installation manual](https://github.com/teamdigitale/io-developer-portal-backend) to customize the sign-up and sign-in default forms
