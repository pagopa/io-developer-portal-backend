import * as apim from "../apim_operations";
import * as services from "../controllers/services";

import ApiManagementClient from "azure-arm-apimanagement";
import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";
import { Logo } from "../../generated/api/Logo";
import { putOrganizationLogo, putServiceLogo } from "../controllers/services";
import { SessionUser } from "../utils/session";

import { none, option } from "fp-ts/lib/Option";
import SerializableSet from "json-set-map/build/src/set";
import { IExtendedUserContract } from "../apim_operations";

import { SubscriptionContract } from "azure-arm-apimanagement/lib/models";
import { ServiceId } from "../../generated/api/ServiceId";

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const serviceId = "s123" as ServiceId;

const organizationFiscalCode = "0123455" as OrganizationFiscalCode;

const userContract: IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet<string>(["user"]),
  id: "124123_id",
  name: "name"
};

const adminUserContract: apim.IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet<string>(["apiadmin"]),
  id: "124123_id",
  name: "name"
};

const adUser = {
  emails: ["test@test.it"],
  extension_Department: "deparment",
  extension_Organization: "organization",
  extension_Service: "service",
  family_name: "name",
  given_name: "given_name",

  oid: "oid"
} as SessionUser;

const logo = { logo: "logo_base_64" } as Logo;

const apiManagementClientMock = ({} as unknown) as ApiManagementClient;

const subscriptionContract: SubscriptionContract & { readonly name: string } = {
  name: "name",
  primaryKey: "234324",
  productId: "1234",
  secondaryKey: "343434",
  state: "state",
  userId: "1234"
};

describe("putServiceLogo", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload was successfull", async () => {
    jest
      .spyOn(apim, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(option.of(adminUserContract)));

    jest
      .spyOn(apim, "getUserSubscription")
      .mockReturnValueOnce(Promise.resolve(option.of(subscriptionContract)));

    jest
      .spyOn(services.notificationApiClient, "uploadServiceLogo")
      .mockReturnValueOnce(
        Promise.resolve({
          headers: undefined,
          status: 201,
          value: undefined
          // tslint:disable-next-line: no-any
        } as any)
      );

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should respond with IResponseErrorNotFound if cannot find a user in the API management", async () => {
    jest.spyOn(apim, "getApimUser").mockReturnValueOnce(Promise.resolve(none));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with ResponseErrorForbiddenNotAuthorized if user is not the service owner", async () => {
    jest
      .spyOn(apim, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(option.of(userContract)));

    jest
      .spyOn(apim, "getUserSubscription")
      .mockReturnValueOnce(Promise.resolve(none));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with IResponseErrorInternal if getUserSubscription fail", async () => {
    jest
      .spyOn(apim, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(option.of(adminUserContract)));

    jest
      .spyOn(apim, "getUserSubscription")
      .mockReturnValueOnce(Promise.reject(new Error("Api Error")));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseErrorInternal");
  });
});

describe("putOrganizationLogo", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload was successfull", async () => {
    jest
      .spyOn(apim, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(option.of(adminUserContract)));

    jest
      .spyOn(services.notificationApiClient, "uploadOrganizationLogo")
      .mockReturnValueOnce(
        Promise.resolve({
          headers: undefined,
          status: 201,
          value: undefined
          // tslint:disable-next-line: no-any
        } as any)
      );

    const result = await putOrganizationLogo(
      apiManagementClientMock,
      adUser,
      organizationFiscalCode,
      logo
    );
    expect(result.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should respond with IResponseErrorNotFound if cannot find a user in the API management", async () => {
    jest.spyOn(apim, "getApimUser").mockReturnValueOnce(Promise.resolve(none));

    const result = await putOrganizationLogo(
      apiManagementClientMock,
      adUser,
      organizationFiscalCode,
      logo
    );
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with ResponseErrorForbiddenNotAuthorized if user is not admin", async () => {
    jest
      .spyOn(apim, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(option.of(userContract)));

    const result = await putOrganizationLogo(
      apiManagementClientMock,
      adUser,
      organizationFiscalCode,
      logo
    );
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});
