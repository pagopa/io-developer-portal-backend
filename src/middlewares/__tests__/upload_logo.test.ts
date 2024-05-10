import * as apim from "../../apim_operations";
import * as services from "../../controllers/services";

import { none, option } from "fp-ts/lib/Option";
import SerializableSet from "json-set-map/build/src/set";
import {
  checkAdminTask,
  getApimUserTask,
  uploadOrganizationLogoTask,
  uploadServiceLogoTask
} from "../upload_logo";

import { Logo } from "../../../generated/api/Logo";

import { ApiManagementClient } from "@azure/arm-apimanagement";
import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../../generated/api/ServiceId";
import { SessionUser } from "../../utils/session";

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const adminUserContract: apim.IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet<string>(["apiadmin"]),
  id: "124123_id",
  name: "name"
};

const userContract: apim.IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet<string>(["user"]),
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

const serviceId = "s123" as ServiceId;

const organizationFiscalCode = "0123455" as OrganizationFiscalCode;

const apiManagementClientMock = ({} as unknown) as ApiManagementClient;

describe("getApimUserTask", () => {
  it("should respond with IExtendedUserContract if the user exists in the API management", async () => {
    jest
      .spyOn(apim, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(option.of(userContract)));

    const result = await getApimUserTask(apiManagementClientMock, adUser).run();

    expect(result.isRight()).toBe(true);
    expect(result.value).toBe(userContract);
  });
  it("should respond with IResponseErrorNotFound if the user does not exist in the API management", async () => {
    jest.spyOn(apim, "getApimUser").mockReturnValueOnce(Promise.resolve(none));

    const result = await getApimUserTask(apiManagementClientMock, adUser).run();

    expect(result.isLeft()).toBe(true);
  });
});

describe("checkAdminTask", () => {
  it("should respond with IExtendedUserContract if the user is an admin", async () => {
    const result = await checkAdminTask(adminUserContract).run();

    expect(result.isRight()).toBe(true);
    expect(result.value).toBe(adminUserContract);
  });

  it("should respond with ResponseErrorForbiddenNotAuthorized if the user is an admin", async () => {
    const result = await checkAdminTask(userContract)
      .mapLeft(error => error.kind)
      .run();

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});

describe("uploadServiceLogoTask", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload is successfull", async () => {
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

    const result = await uploadServiceLogoTask(serviceId, logo).run();

    expect(result.isRight()).toBe(true);
    expect(result.value.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should respond with IResponseSuccessRedirectToResource if logo upload is not successfull", async () => {
    jest
      .spyOn(services.notificationApiClient, "uploadServiceLogo")
      .mockReturnValueOnce(
        Promise.resolve({
          headers: undefined,
          status: 400,
          value: undefined
          // tslint:disable-next-line: no-any
        } as any)
      );

    const result = await uploadServiceLogoTask(serviceId, logo).run();

    expect(result.isLeft()).toBe(true);
    expect(result.value.kind).toBe("IResponseErrorInternal");
  });
});

describe("uploadOrganizationLogoTask", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload is successfull", async () => {
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

    const result = await uploadOrganizationLogoTask(
      organizationFiscalCode,
      logo
    ).run();

    expect(result.isRight()).toBe(true);
    expect(result.value.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should respond with IResponseSuccessRedirectToResource if logo upload is not successfull", async () => {
    jest
      .spyOn(services.notificationApiClient, "uploadOrganizationLogo")
      .mockReturnValueOnce(
        Promise.resolve({
          headers: undefined,
          status: 400,
          value: undefined
          // tslint:disable-next-line: no-any
        } as any)
      );

    const result = await uploadOrganizationLogoTask(
      organizationFiscalCode,
      logo
    ).run();

    expect(result.isLeft()).toBe(true);
    expect(result.value.kind).toBe("IResponseErrorInternal");
  });
});
