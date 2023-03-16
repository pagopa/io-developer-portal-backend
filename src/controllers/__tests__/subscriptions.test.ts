import ApiManagementClient from "azure-arm-apimanagement";
import { none, some } from "fp-ts/lib/Option";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
import { CIDR } from "../../../generated/api/CIDR";
import * as apimOperations from "../../apim_operations";
import { IExtendedUserContract } from "../../apim_operations";
import { SessionUser } from "../../utils/session";
import { notificationApiClient } from "../services";
import { getSubscriptionCIDRs, putSubscriptionCIDRs } from "../subscriptions";

afterEach(() => {
  jest.clearAllMocks();
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
  groupNames: new SerializableSet(["apiadmin", "group_2"]),
  id: "124123_id",
  name: "name"
};

const aNotAdminUser: IExtendedUserContract = {
  ...anAdminUser,
  groupNames: new SerializableSet(["group_1", "group_2"])
};
// tslint:disable-next-line: no-any
const anArrayWithCIDR: ReadonlyArray<any> = [
  ("1.1.1.1/32" as unknown) as CIDR
];
// tslint:disable-next-line: no-any
const anArrayWithCIDRResponse: ReadonlyArray<any> = ["1.1.1.1/32"];

jest.spyOn(apimOperations, "getApimUser").mockReturnValue(
  new Promise(resolve => {
    resolve(some(anAdminUser));
  })
);

jest
  .spyOn(notificationApiClient, "updateSubscriptionCidrs")
  // tslint:disable-next-line: no-any
  .mockImplementation(() =>
    // tslint:disable-next-line: no-any
    Promise.resolve({ status: 200, value: anArrayWithCIDRResponse } as any)
  );
jest
  .spyOn(notificationApiClient, "getSubscriptionCidrs")
  // tslint:disable-next-line: no-any
  .mockImplementation(() =>
    // tslint:disable-next-line: no-any
    Promise.resolve({ status: 200, value: anArrayWithCIDRResponse } as any)
  );

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

  it("should respond successfully with updated CIDRs payload for an admin user", async () => {
    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      anArrayWithCIDR
    );

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: anArrayWithCIDRResponse
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
      value: anArrayWithCIDRResponse
    });
  });
});
