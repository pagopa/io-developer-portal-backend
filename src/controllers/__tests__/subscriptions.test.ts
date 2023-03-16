// import * as apiClient from "../../api_client";
import * as apimOperations from "../../apim_operations";

import ApiManagementClient from "azure-arm-apimanagement";
import { some } from "fp-ts/lib/Option";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
// import { CIDRsPayload } from "../../../generated/api/CIDRsPayload";
import { IExtendedUserContract } from "../../apim_operations";
import { SessionUser } from "../../utils/session";
import { notificationApiClient } from "../services";
import {
  putSubscriptionCIDRs,
  putSubscriptionCIDRsInPipe
} from "../subscriptions";
import { CIDR } from "../../../generated/api/CIDR";

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

// const aNotAdminUser: IExtendedUserContract = {
//   ...anAdminUser,
//   groupNames: new SerializableSet(["group_1", "group_2"])
// };

jest.spyOn(apimOperations, "getApimUser").mockReturnValue(
  new Promise(resolve => {
    resolve(some(anAdminUser));
  })
);

// jest.spyOn(apiClient, "APIClient").mockReturnValue(({
//   updateSubscriptionCidrs: jest.fn()
// } as unknown) as any);

jest
  .spyOn(notificationApiClient, "updateSubscriptionCidrs")
  // tslint:disable-next-line: no-any
  .mockImplementation(() =>
    Promise.resolve({ status: 200, value: ["1.1.1.1/32"] } as any)
  );

describe("Test Subscriptions update with CIDRs", () => {
  it("will be update successfully a CIDRs payload for an Admin user", async () => {
    const res = await putSubscriptionCIDRs(
      apiClientMock,
      adUser,
      aSubscriptionId,
      [("1.1.1.1/32" as unknown) as CIDR]
    );
    console.log("****** RES *******");
    console.log(res);
    console.log("*****************");
    const res2 = await putSubscriptionCIDRsInPipe(
      apiClientMock,
      adUser,
      aSubscriptionId,
      [("1.1.1.1/32" as unknown) as CIDR]
    );
    console.log("****** RES2 *******");
    console.log(res2);

    expect(res).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: { status: 200, value: ["1.1.1.1/32"] }
    });
  });
});
