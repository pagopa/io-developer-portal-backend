FROM circleci/node:10.14.1 as builder

WORKDIR /usr/src/app

COPY /src /usr/src/app/src
COPY /patches /usr/src/app/patches
COPY /web /usr/src/app/web
COPY /package.json /usr/src/app/package.json
COPY /package-lock.json /usr/src/app/package-lock.json
COPY /tsconfig.json /usr/src/app/tsconfig.json

RUN sudo chmod -R 777 /usr/src/app
RUN npm install
RUN npm run build

FROM node:10.14.1-alpine
LABEL maintainer="https://teamdigitale.governo.it"

# Install major CA certificates to cover
# https://github.com/SparebankenVest/azure-key-vault-to-kubernetes integration
RUN apk update && \
    apk add ca-certificates

WORKDIR /usr/src/app
COPY /package.json /usr/src/app/package.json
COPY /web /usr/src/app/public
COPY --from=builder /usr/src/app/build /usr/src/app/build
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules

EXPOSE 3000

ENTRYPOINT npm run start
