import * as apimOperations from "../../apim_operations";
import * as config from "../../config";
import * as uploadTasks from "../../middlewares/upload_logo";

import ApiManagementClient from "azure-arm-apimanagement";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import {
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import {
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import { Logo } from "../../../generated/api/Logo";

import {
  getReviewStatus,
  newReviewRequest,
  notificationApiClient,
  putOrganizationLogo,
  putServiceLogo
} from "../services";

import { SubscriptionContract } from "azure-arm-apimanagement/lib/models";
import { none, some } from "fp-ts/lib/Option";
import SerializableSet from "json-set-map/build/src/set";
import { ServiceId } from "../../../generated/api/ServiceId";
import { IExtendedUserContract } from "../../apim_operations";
import { IJiraAPIClient } from "../../jira_client";
import { IStorageQueueClient } from "../../storage_queue_client";
import { SessionUser } from "../../utils/session";

afterEach(() => {
  jest.clearAllMocks();
});

const serviceId = "s123" as ServiceId;

const organizationFiscalCode = "0123455" as OrganizationFiscalCode;

const userContract: IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet(["groupp_1", "group_2"]),
  id: "124123_id",
  name: "name"
};

const subscriptionContract: SubscriptionContract & { readonly name: string } = {
  name: "name",
  primaryKey: "234324",
  productId: "1234",
  secondaryKey: "343434",
  state: "state",
  userId: "1234"
};

const responseSuccess = ResponseSuccessRedirectToResource(
  {},
  "services/serviceId.png",
  {}
);

const responseErrorNotFound = ResponseErrorNotFound(
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
} as SessionUser;

const logo = { logo: "logo_base_64" } as Logo;

const apiManagementClientMock = ({} as unknown) as ApiManagementClient;

const jiraClientFnMock = jest.fn();
const jiraClientMock: IJiraAPIClient = {
  applyJiraIssueTransition: jiraClientFnMock,
  createJiraIssue: jiraClientFnMock,
  createJiraIssueComment: jiraClientFnMock,
  deleteJiraIssue: jiraClientFnMock,
  getServiceJiraIssuesByStatus: jiraClientFnMock,
  searchServiceJiraIssue: jiraClientFnMock
};

const jiraConfigMock = {} as config.IJIRA_CONFIG;

const mockGetApimUser = jest
  .spyOn(apimOperations, "getApimUser")
  .mockReturnValue(
    new Promise(resolve => {
      // IExtendedUserContract
      resolve(some(userContract));
    })
  );

jest.spyOn(apimOperations, "getUserSubscription").mockReturnValue(
  new Promise(resolve => {
    // SubscriptionContract & { readonly name: string }
    resolve(some(subscriptionContract));
  })
);

jest
  .spyOn(notificationApiClient, "getService")
  // tslint:disable-next-line: no-any
  .mockImplementation(() => Promise.resolve({ status: 200, value: {} } as any));
describe("putServiceLogo", () => {
  it("should respond with IResponseSuccessRedirectToResource if logo upload was successfull", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "getUserSubscriptionTask")
      .mockReturnValueOnce(taskEither.of(subscriptionContract));

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
      .mockReturnValueOnce(fromLeft(responseErrorNotFound));

    const result = await putServiceLogo(
      apiManagementClientMock,
      adUser,
      serviceId,
      logo
    );
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with ResponseErrorForbiddenNotAuthorized if user is not admin and is not the service owner", async () => {
    jest
      .spyOn(uploadTasks, "getApimUserTask")
      .mockReturnValueOnce(taskEither.of(userContract));

    jest
      .spyOn(uploadTasks, "getUserSubscriptionTask")
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
      .mockReturnValueOnce(fromLeft(responseErrorNotFound));

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

describe("jiraStatus", () => {
  it("should respond with Jira Issue Status", async () => {
    jiraClientFnMock.mockReturnValue(
      taskEither.of({
        issues: [
          {
            fields: {
              status: {
                name: "NEW"
              }
            },
            id: "342" as NonEmptyString,
            key: "DMT-1" as NonEmptyString,
            self: "SELF" as NonEmptyString
          }
        ],
        startAt: 0,
        total: 1
      })
    );

    const response = await getReviewStatus(
      apiManagementClientMock,
      jiraClientMock,
      adUser,
      "DMT-1" as NonEmptyString
    );

    if (response.kind === "IResponseSuccessJson") {
      // We expect to have a detail equal to NEW
      expect(response.value.detail).toEqual("NEW");
    }
  });

  it("should respond with Jira Issue Status Not Found", async () => {
    jiraClientFnMock.mockReturnValue(
      taskEither.of({
        issues: [],
        startAt: 0,
        total: 0
      })
    );

    const response = await getReviewStatus(
      apiManagementClientMock,
      jiraClientMock,
      adUser,
      "DMT-1" as NonEmptyString
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });
});

describe("jiraRequest", () => {
  const storageQueueClientMock: IStorageQueueClient = {
    insertNewMessage: jest.fn()
  };
  it("should respond with IResponseErrorNotFound", async () => {
    mockGetApimUser.mockReturnValueOnce(
      new Promise(resolve => {
        resolve(none);
      })
    );
    const response = await newReviewRequest(
      apiManagementClientMock,
      jiraClientMock,
      storageQueueClientMock,
      adUser,
      "DMT-1" as NonEmptyString,
      jiraConfigMock
    );
    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should respond with IResponseErrorInternal", async () => {
    jiraClientFnMock.mockReturnValue(
      fromLeft(ResponseErrorInternal("getServiceJiraIssuesByStatus ERROR"))
    );

    const response = await newReviewRequest(
      apiManagementClientMock,
      jiraClientMock,
      storageQueueClientMock,
      adUser,
      "DMT-1" as NonEmptyString,
      jiraConfigMock
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });
});
