import * as uploadTasks from "../../middlewares/upload_logo";

import ApiManagementClient from "azure-arm-apimanagement";
import { taskEither } from "fp-ts/lib/TaskEither";
import { fromLeft } from "fp-ts/lib/TaskEither";
import {
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorNotFound,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";
import { Logo } from "../../../generated/api/Logo";
import { AdUser } from "../../bearer_strategy";
import { putOrganizationLogo, putServiceLogo } from "../services";

import SerializableSet from "json-set-map/build/src/set";
import { ServiceId } from "../../../generated/api/ServiceId";
import { IExtendedUserContract } from "../../apim_operations";

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const serviceId = "s123" as ServiceId;

const organizationFiscalCode = "0123455" as OrganizationFiscalCode;

const userContract: IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet(["groupp_1", "group_2"]),
  id: "124123_id",
  name: "name"
};

const responseSuccess = ResponseSuccessRedirectToResource(
  {},
  "services/serviceId.png",
  {}
);

const responseErrorNotFoaund = ResponseErrorNotFound(
  "API user not found",
  "Cannot find a user in the API management with the provided email address"
);

const adUser = {
  emails: ["test@test.it"],
  extension_Department: "deparment",
  extension_Organization: "organization",
  extension_Service: "service",
  family_name: "name",
  given_name: "given_name",
  oid: "oid"
} as AdUser;

const logo = { logo: "logo_base_64" } as Logo;

const apiManagementClientMock = ({} as unknown) as ApiManagementClient;

describe("putServiceLogo", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload was successfull", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "checkAdminTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "uploadServiceLogoTask")
      .mockReturnValueOnce(taskEither.of(responseSuccess));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should respond with IResponseErrorNotFound if cannot find a user in the API management", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(fromLeft(responseErrorNotFoaund));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with ResponseErrorForbiddenNotAuthorized if user is not admin", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "checkAdminTask")
      .mockReturnValueOnce(fromLeft(ResponseErrorForbiddenNotAuthorized));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});

describe("putOrganizationLogo", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload was successfull", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "checkAdminTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "uploadOrganizationLogoTask")
      .mockReturnValueOnce(taskEither.of(responseSuccess));

    const result = await putOrganizationLogo(
      apiManagementClientMock,
      adUser,
      organizationFiscalCode,
      logo
    );
    expect(result.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should respond with IResponseErrorNotFound if cannot find a user in the API management", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(fromLeft(responseErrorNotFoaund));

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
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "checkAdminTask")
      .mockReturnValueOnce(fromLeft(ResponseErrorForbiddenNotAuthorized));

    const result = await putOrganizationLogo(
      apiManagementClientMock,
      adUser,
      organizationFiscalCode,
      logo
    );
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});
