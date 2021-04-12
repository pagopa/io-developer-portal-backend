import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
import { CIDR } from "../../../generated/api/CIDR";
import { OrganizationFiscalCode } from "../../../generated/api/OrganizationFiscalCode";
import { Service } from "../../../generated/api/Service";
import { ServiceScopeEnum } from "../../../generated/api/ServiceScope";
import { IExtendedUserContract } from "../../apim_operations";
import { ServicePayload } from "../../controllers/services";
import { getServicePayloadUpdater } from "../conversions";

const userContract: IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet(["group_1", "group_2"]),
  id: "124123_id",
  name: "name"
};
const aCIDR: CIDR = "192.168.1.1/32" as CIDR;
const anotherCIDR: CIDR = "192.168.1.2" as CIDR;

const aService: Service = {
  authorized_cidrs: [aCIDR],
  authorized_recipients: ["AAAAAA01B02C123D" as FiscalCode],
  department_name: "department" as NonEmptyString,
  organization_fiscal_code: "01234567890" as OrganizationFiscalCode,
  organization_name: "organization" as NonEmptyString,
  service_id: "SERVICE_ID" as NonEmptyString,
  service_name: "service name" as NonEmptyString,

  is_visible: false,
  version: 1,

  service_metadata: {
    scope: ServiceScopeEnum.NATIONAL
  }
};

const aServicePayload: ServicePayload = {
  authorized_cidrs: [anotherCIDR],
  authorized_recipients: ([
    "AAAAAA01B02C123D",
    "BBBBBB01C02D321E"
  ] as unknown) as ReadonlyArray<FiscalCode>,
  department_name: "new department" as NonEmptyString,
  is_visible: true,
  organization_name: "new organization name" as NonEmptyString,
  service_name: "new service name" as NonEmptyString,

  service_metadata: {
    address: "address" as NonEmptyString,
    description: "Service description" as NonEmptyString,
    privacy_url: "https://example.com/privacy" as NonEmptyString,
    scope: ServiceScopeEnum.LOCAL
  }
};

describe("getServicePayloadUpdater", () => {
  it("should an Admin update all the properties", () => {
    const payload = getServicePayloadUpdater({
      ...userContract,
      groupNames: new SerializableSet(["apiadmin"])
    })(aService, aServicePayload);
    expect(payload).toEqual({ ...aService, ...aServicePayload });
  });
  it("should doesn't update recipients and visibility if the user is not an Admin", () => {
    const payload = getServicePayloadUpdater(userContract)(
      aService,
      aServicePayload
    );
    expect(payload.authorized_recipients).toEqual(
      aService.authorized_recipients
    );
    expect(payload.is_visible).toEqual(aService.is_visible);
  });

  it("should doesn't update scope if the service is visible and user is not an Admin", () => {
    const payload = getServicePayloadUpdater(userContract)(
      {
        ...aService,
        is_visible: true,
        service_metadata: {
          scope: ServiceScopeEnum.NATIONAL
        }
      },
      aServicePayload
    );
    expect(payload.service_metadata).toHaveProperty(
      "scope",
      ServiceScopeEnum.NATIONAL
    );
    expect(payload.is_visible).toEqual(true);
  });
  it("should update scope if the service is visible and the user is Admin", () => {
    const payload = getServicePayloadUpdater({
      ...userContract,
      groupNames: new SerializableSet(["apiadmin"])
    })(
      {
        ...aService,
        is_visible: true,
        service_metadata: {
          scope: ServiceScopeEnum.NATIONAL
        }
      },
      aServicePayload
    );
    expect(payload.service_metadata).toHaveProperty(
      "scope",
      ServiceScopeEnum.LOCAL
    );
    expect(payload.is_visible).toEqual(true);
  });

  it("should doesn't update token_name if the user is not an Admin", () => {
    const payload = getServicePayloadUpdater(userContract)(aService, {
      ...aServicePayload,
      service_metadata: {
        scope: ServiceScopeEnum.NATIONAL,
        token_name: "NEW_TOKEN" as NonEmptyString
      }
    });
    expect(payload.service_metadata).toHaveProperty("token_name", undefined);
  });

  it("should can update token_name if the user is an Admin", () => {
    const expectedTokenName = "NEW_TOKEN" as NonEmptyString;
    const payload = getServicePayloadUpdater({
      ...userContract,
      groupNames: new SerializableSet(["apiadmin"])
    })(
      {
        ...aService,
        service_metadata: {
          scope: ServiceScopeEnum.NATIONAL,
          token_name: "TOKEN" as NonEmptyString
        }
      },
      {
        ...aServicePayload,
        service_metadata: {
          scope: ServiceScopeEnum.NATIONAL,
          token_name: expectedTokenName
        }
      }
    );
    expect(payload.service_metadata).toHaveProperty(
      "token_name",
      expectedTokenName
    );
  });
});
