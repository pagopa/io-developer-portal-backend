import { fromNullable, some } from "fp-ts/lib/Option";
import { pick } from "italia-ts-commons/lib/types";
import { Service } from "../../generated/api/Service";
import { ServiceMetadata } from "../../generated/api/ServiceMetadata";
import { ServiceScopeEnum } from "../../generated/api/ServiceScope";
import { VisibleServicePayload } from "../../generated/api/VisibleServicePayload";
import { IExtendedUserContract, isAdminUser } from "../apim_operations";
import { ServicePayload } from "../controllers/services";

export const getServicePayloadUpdater = (user: IExtendedUserContract) => (
  originalService: Service,
  payload: ServicePayload
) => {
  const filteredPayload = !isAdminUser(user)
    ? pick(
        [
          "department_name",
          "organization_fiscal_code",
          "organization_name",
          "service_name",
          "authorized_cidrs"
        ],
        payload
      )
    : payload;

  const serviceMetadata: ServiceMetadata = {
    ...originalService.service_metadata,
    ...payload.service_metadata,
    // Scope for visible services cannot be changed
    scope: VisibleServicePayload.is(originalService)
      ? originalService.service_metadata.scope
      : fromNullable(payload.service_metadata?.scope)
          .fold(fromNullable(originalService.service_metadata?.scope), some)
          .getOrElse(ServiceScopeEnum.LOCAL)
  };

  return {
    ...originalService,
    ...filteredPayload,
    service_metadata: serviceMetadata
  };
};
