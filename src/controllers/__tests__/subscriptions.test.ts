import {
  ApiManagementClient,
  SubscriptionContract
} from "@azure/arm-apimanagement";
import * as E from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { ResponseErrorForbiddenNotAuthorized } from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
import { CIDR } from "../../../generated/api/CIDR";
import * as apimOperations from "../../apim_operations";
import { IExtendedUserContract } from "../../apim_operations";
import * as subscriptionController from "../../controllers/subscriptions";
import * as actualUser from "../../middlewares/actual_user";
import * as newSubscription from "../../new_subscription";
import { SessionUser } from "../../utils/session";

import {
  getSubscriptionCIDRs,
  getSubscriptionManage,
  notificationApiClient,
  putSubscriptionCIDRs
} from "../subscriptions";

// tslint:disable-next-line
const configModule = require("../../config");

afterEach(() => {
  jest.clearAllMocks();
});

beforeEach(() => {
  // tslint:disable-next-line
  configModule.manageFlowEnableUserList = "aUserId";
});

const apiClientMock = ({} as unknown) as ApiManagementClient;

const adUser = {
  emails: ["test@test.it"],
  extension_Department: "deparment",
  extension_Organization: "organization",
  extension_Service: "service",
  family_name: "name",
  given_name: "given_name",
  oid: "oid"
} as SessionUser;

const aSubscriptionId = "1234ABC" as NonEmptyString;

const anAdminUser: IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet(["apiadmin", "group_2", "apiservicewrite"]),
  id:
    "/subscriptions/abc/resourceGroups/io-p-rg-internal/providers/Microsoft.ApiManagement/service/io-p-apim-api/users/aUserId",
  name: "name"
};

const aNotAdminUser: IExtendedUserContract = {
  ...anAdminUser,
  groupNames: new SerializableSet(["group_1", "group_2"])
};
// tslint:disable-next-line: no-any
const anArrayWithCIDR: ReadonlyArray<any> = [("1.1.1.1/32" as unknown) as CIDR];
// tslint:disable-next-line: no-any
const aSubscriptionCidrsResponse = {
  cidrs: ["1.1.1.1/32"],
  id: aSubscriptionId
};

const aSubscriptionContract: SubscriptionContract & {
  readonly name: string;
} = {
  name: aSubscriptionId,
  primaryKey: "234324",
  scope: "/products/1234",
  secondaryKey: "343434",
  state: "active",
  ownerId: "1234"
};

jest.spyOn(apimOperations, "getApimUser").mockReturnValue(
  new Promise(resolve => {
    resolve(some(anAdminUser));
  })
);

jest.mock("../../utils/telemetry-client", () => ({
  initTelemetryClient: jest.fn().mockReturnValue({
    // Il tuo oggetto mockato va qui
    trackEvent: jest.fn(),
    trackError: jest.fn()
  })
}));

jest
  .spyOn(notificationApiClient, "updateSubscriptionCidrs")
  // tslint:disable-next-line: no-any
  .mockImplementation(() =>
    // tslint:disable-next-line: no-any
    Promise.resolve({ status: 200, value: aSubscriptionCidrsResponse } as any)
  );
jest
  .spyOn(notificationApiClient, "getSubscriptionCidrs")
  // tslint:disable-next-line: no-any
  .mockImplementation(() =>
    // tslint:disable-next-line: no-any
    Promise.resolve({ status: 200, value: aSubscriptionCidrsResponse } as any)
  );

const mockGetActualUser = jest.fn();
mockGetActualUser.mockImplementation(() => Promise.resolve(anAdminUser));

describe("Test Update Subscription CIDRs", () => {
  it("should respond with IResponseErrorForbiddenNotAuthorized if apim return a none user", async () => {
    jest
      .spyOn(apimOperations, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(none));

    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      anArrayWithCIDR
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorForbiddenNotAuthorized if user is not an admin one", async () => {
    jest.spyOn(apimOperations, "getApimUser").mockReturnValueOnce(
      new Promise(resolve => {
        resolve(some(aNotAdminUser));
      })
    );

    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      anArrayWithCIDR
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorInternal if update Subscription cidrs return undefined", async () => {
    jest
      .spyOn(notificationApiClient, "updateSubscriptionCidrs")
      // tslint:disable-next-line: no-any
      .mockReturnValueOnce(Promise.resolve(undefined));

    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      anArrayWithCIDR
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorInternal"
    });
  });

  it("should respond with IResponseErrorInternal if update Subscription cidrs return an http error code", async () => {
    jest
      .spyOn(notificationApiClient, "updateSubscriptionCidrs")
      // tslint:disable-next-line: no-any
      .mockReturnValueOnce(
        Promise.resolve({
          headers: undefined,
          status: 500,
          value: undefined
          // tslint:disable-next-line: no-any
        } as any)
      );

    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      anArrayWithCIDR
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorInternal"
    });
  });

  it("should respond successfully with updated Subscription CIDRs data for an admin user", async () => {
    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      anArrayWithCIDR
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: aSubscriptionCidrsResponse
    });
  });
});

describe("Test Get Subscription CIDRs", () => {
  it("should respond with IResponseErrorForbiddenNotAuthorized if apim return a none user", async () => {
    jest
      .spyOn(apimOperations, "getApimUser")
      .mockReturnValueOnce(Promise.resolve(none));

    const res = await getSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorForbiddenNotAuthorized if user is not an admin one", async () => {
    jest.spyOn(apimOperations, "getApimUser").mockReturnValueOnce(
      new Promise(resolve => {
        resolve(some(aNotAdminUser));
      })
    );

    const res = await getSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorInternal if get Subscription cidrs return undefined", async () => {
    jest
      .spyOn(notificationApiClient, "getSubscriptionCidrs")
      // tslint:disable-next-line: no-any
      .mockReturnValueOnce(Promise.resolve(undefined));

    const res = await getSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorInternal"
    });
  });

  it("should respond with IResponseErrorInternal if get Subscription cidrs return an http error code", async () => {
    jest
      .spyOn(notificationApiClient, "getSubscriptionCidrs")
      // tslint:disable-next-line: no-any
      .mockReturnValueOnce(
        Promise.resolve({
          headers: undefined,
          status: 500,
          value: undefined
          // tslint:disable-next-line: no-any
        } as any)
      );

    const res = await getSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorInternal"
    });
  });

  it("should respond successfully with retrieved CIDRs payload for an admin user", async () => {
    const res = await getSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: aSubscriptionCidrsResponse
    });
  });
});

describe("Test Get Subscription Manage", () => {
  it("should respond with IResponseErrorForbiddenNotAuthorized if apim return a none user", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(
        Promise.resolve(new E.Left(ResponseErrorForbiddenNotAuthorized))
      );

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorForbiddenNotAuthorized if user is not present in MANAGE_FLOW_ENABLE_USER_LIST", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(aNotAdminUser)));

    // tslint:disable-next-line
    configModule.manageFlowEnableUserList = "aDifferentUserId";

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorForbiddenNotAuthorized if user has NO apiservicewrite permission", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(aNotAdminUser)));

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorForbiddenNotAuthorized if Manage Subscription doesn't exist and its creation returns an error", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(anAdminUser)));
    jest
      .spyOn(apimOperations, "getUserSubscriptionManage")
      .mockReturnValueOnce(Promise.resolve(none));
    jest
      .spyOn(newSubscription, "subscribeApimUser")
      .mockReturnValueOnce(
        Promise.resolve(new E.Left(new Error("error on subscribeApimUser")))
      );

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorForbiddenNotAuthorized"
    });
  });

  it("should respond with IResponseErrorInternal if Manage Subscription doesn't exist, subscription creation is done but related cidrs initialization return an error", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(anAdminUser)));
    jest
      .spyOn(apimOperations, "getUserSubscriptionManage")
      .mockReturnValueOnce(Promise.resolve(none));
    jest
      .spyOn(newSubscription, "subscribeApimUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(aSubscriptionContract)));
    jest
      .spyOn(notificationApiClient, "updateSubscriptionCidrs")
      // tslint:disable-next-line: no-any
      .mockReturnValueOnce(Promise.resolve(undefined));
    jest
      .spyOn(subscriptionController, "initializeSubscriptionCidrs")
      .mockReturnValueOnce(
        Promise.resolve(new E.Left(new Error("Error on upsert")))
      );

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseErrorInternal"
    });
  });

  it("should respond with Manage Subscription data if subscription creation and cidrs initialization are both correctly done", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(anAdminUser)));
    jest
      .spyOn(apimOperations, "getUserSubscriptionManage")
      .mockReturnValueOnce(Promise.resolve(none));
    jest
      .spyOn(newSubscription, "subscribeApimUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(aSubscriptionContract)));
    jest
      .spyOn(subscriptionController, "initializeSubscriptionCidrs")
      .mockReturnValueOnce(
        Promise.resolve(new E.Right({ id: aSubscriptionId, cidrs: [] }))
      );

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: aSubscriptionContract
    });
  });

  it("should respond with Manage Subscription data if subscription creation and cidrs initialization are both correctly done and * is present in MANAGE_FLOW_ENABLE_USER_LIST", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(anAdminUser)));
    jest
      .spyOn(apimOperations, "getUserSubscriptionManage")
      .mockReturnValueOnce(Promise.resolve(none));
    jest
      .spyOn(newSubscription, "subscribeApimUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(aSubscriptionContract)));
    jest
      .spyOn(subscriptionController, "initializeSubscriptionCidrs")
      .mockReturnValueOnce(
        Promise.resolve(new E.Right({ id: aSubscriptionId, cidrs: [] }))
      );
    // tslint:disable-next-line
    configModule.manageFlowEnableUserList = "*";
    const res = await getSubscriptionManage(apiClientMock, adUser);
    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: aSubscriptionContract
    });
  });

  it("should respond with Manage Subscription data if it already exists", async () => {
    jest
      .spyOn(actualUser, "getActualUser")
      .mockReturnValueOnce(Promise.resolve(new E.Right(anAdminUser)));
    jest
      .spyOn(apimOperations, "getUserSubscriptionManage")
      .mockReturnValueOnce(Promise.resolve(some(aSubscriptionContract)));

    const res = await getSubscriptionManage(apiClientMock, adUser);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: aSubscriptionContract
    });
  });
});
