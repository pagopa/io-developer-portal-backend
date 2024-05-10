import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import SerializableSet from "json-set-map/build/src/set";
import { CIDR } from "../../../generated/api/CIDR";
import { OrganizationFiscalCode } from "../../../generated/api/OrganizationFiscalCode";
import { Service } from "../../../generated/api/Service";
import { ServiceScopeEnum } from "../../../generated/api/ServiceScope";
import { SpecialServiceCategoryEnum } from "../../../generated/api/SpecialServiceCategory";
import { SpecialServiceMetadata } from "../../../generated/api/SpecialServiceMetadata";
import { StandardServiceCategoryEnum } from "../../../generated/api/StandardServiceCategory";
import { StandardServiceMetadata } from "../../../generated/api/StandardServiceMetadata";
import { IExtendedUserContract } from "../../apim_operations";
import { ServicePayload } from "../../controllers/services";
import { getServicePayloadUpdater } from "../../conversions";

const userContract: IExtendedUserContract = {
  email: "test@test.it",
  groupNames: new SerializableSet(["group_1", "group_2"]),
  id: "124123_id",
  name: "name"
};

const adminUserContract: IExtendedUserContract = {
  ...userContract,
  groupNames: new SerializableSet(["apiadmin"])
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
  organization_fiscal_code: "01234567890" as OrganizationFiscalCode,
  organization_name: "new organization name" as NonEmptyString,
  service_name: "new service name" as NonEmptyString,

  service_metadata: {
    address: "address" as NonEmptyString,
    description: "Service description" as NonEmptyString,
    privacy_url: "https://example.com/privacy" as NonEmptyString,
    scope: ServiceScopeEnum.LOCAL
  }
};

const aCommonServicePayload: ServicePayload = aServicePayload;
const aStandardServicePayload: ServicePayload = {
  ...aServicePayload,
  service_metadata: {
    ...aServicePayload.service_metadata,
    category: StandardServiceCategoryEnum.STANDARD
  } as StandardServiceMetadata
};
const aNewCustomFlow = "new_custom_flow" as NonEmptyString;
const aSpecialServicePayload: ServicePayload = {
  ...aServicePayload,
  service_metadata: {
    ...aServicePayload.service_metadata,
    category: SpecialServiceCategoryEnum.SPECIAL,
    custom_special_flow: aNewCustomFlow
  } as SpecialServiceMetadata
};

const aCommonService: Service = aService;
const aStandardService: Service = {
  ...aService,
  service_metadata: {
    ...aService.service_metadata,
    category: StandardServiceCategoryEnum.STANDARD
  } as StandardServiceMetadata
};
const anOldCustomFlow = "custom_flow" as NonEmptyString;
const aSpecialService: Service = {
  ...aService,
  service_metadata: {
    ...aService.service_metadata,
    category: SpecialServiceCategoryEnum.SPECIAL,
    custom_special_flow: anOldCustomFlow
  } as SpecialServiceMetadata
};

describe("getServicePayloadUpdater", () => {
  it("should an Admin update all the properties", () => {
    const payload = getServicePayloadUpdater({
      ...userContract,
      groupNames: new SerializableSet(["apiadmin"])
    })(aService, aServicePayload);
    expect(payload).toEqual({ ...aService, ...aStandardServicePayload });
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
    expect(payload.service_metadata).not.toHaveProperty("token_name");
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

  it("should can delete a metadata field", () => {
    const payload = getServicePayloadUpdater({
      ...userContract,
      groupNames: new SerializableSet(["apiadmin"])
    })(
      {
        ...aService,
        service_metadata: {
          email: "email@example.it" as NonEmptyString, // The metadata field we want to delete
          scope: ServiceScopeEnum.NATIONAL
        }
      },
      {
        ...aServicePayload,
        service_metadata: {
          scope: ServiceScopeEnum.NATIONAL
        }
      }
    );
    expect(payload.service_metadata).not.toHaveProperty("email");
  });

  it.each`
    original            | payload                    | user                 | expectedCategory                        | expectedCustomFlow | s
    ${aCommonService}   | ${aCommonServicePayload}   | ${adminUserContract} | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Common | original: Common | user: Admin"}
    ${aCommonService}   | ${aCommonServicePayload}   | ${userContract}      | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Common | original: Common | user: not Admin"}
    ${aCommonService}   | ${aStandardServicePayload} | ${adminUserContract} | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Standard | original: Common | user: Admin"}
    ${aCommonService}   | ${aStandardServicePayload} | ${userContract}      | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Standard | original: Common | user: not Admin"}
    ${aCommonService}   | ${aSpecialServicePayload}  | ${adminUserContract} | ${SpecialServiceCategoryEnum.SPECIAL}   | ${aNewCustomFlow}  | ${"SPECIAL with input: Special | original: Common | user: Admin"}
    ${aCommonService}   | ${aSpecialServicePayload}  | ${userContract}      | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Special | original: Common | user: not Admin"}
    ${aStandardService} | ${aStandardServicePayload} | ${adminUserContract} | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Standard | original: Standard | user: Admin"}
    ${aStandardService} | ${aStandardServicePayload} | ${userContract}      | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Standard | original: Standard | user: not Admin"}
    ${aSpecialService}  | ${aStandardServicePayload} | ${adminUserContract} | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Standard | original: Special | user: Admin"}
    ${aSpecialService}  | ${aStandardServicePayload} | ${userContract}      | ${SpecialServiceCategoryEnum.SPECIAL}   | ${anOldCustomFlow} | ${"unchanged SPECIAL with input: Standard | original: Special | user: not Admin"}
    ${aStandardService} | ${aSpecialServicePayload}  | ${adminUserContract} | ${SpecialServiceCategoryEnum.SPECIAL}   | ${aNewCustomFlow}  | ${"SPECIAL with input: Special | original: Standard | user: Admin"}
    ${aStandardService} | ${aSpecialServicePayload}  | ${userContract}      | ${StandardServiceCategoryEnum.STANDARD} | ${undefined}       | ${"STANDARD with input: Special | original: Standard | user: not Admin"}
    ${aSpecialService}  | ${aSpecialServicePayload}  | ${adminUserContract} | ${SpecialServiceCategoryEnum.SPECIAL}   | ${aNewCustomFlow}  | ${"SPECIAL with input: Special | original: Special | user: Admin"}
    ${aSpecialService}  | ${aSpecialServicePayload}  | ${userContract}      | ${SpecialServiceCategoryEnum.SPECIAL}   | ${anOldCustomFlow} | ${"unchanged SPECIAL with input: Special | original: Special | user: not Admin"}
  `(
    "should returns $s",
    ({ original, payload, user, expectedCategory, expectedCustomFlow }) => {
      const result = getServicePayloadUpdater(user)(original, payload);
      const decodedResult = Service.decode(result);
      expect(decodedResult.isRight()).toBeTruthy();
      expect(result.service_metadata).toHaveProperty(
        "category",
        expectedCategory
      );

      if (expectedCustomFlow) {
        expect(result.service_metadata).toHaveProperty(
          "custom_special_flow",
          expectedCustomFlow
        );
      } else {
        expect(result.service_metadata).not.toHaveProperty(
          "custom_special_flow"
        );
      }

      if (expectedCategory === StandardServiceCategoryEnum.STANDARD) {
        expect(result.service_metadata).not.toHaveProperty(
          "custom_special_flow"
        );
      }
    }
  );
});
