import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
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
    ...payload.service_metadata,
    // Scope for visible services cannot be changed
    scope:
      !VisibleServicePayload.is(originalService) || isAdminUser(user)
        ? fromNullable(payload.service_metadata?.scope)
            .fold(fromNullable(originalService.service_metadata?.scope), some)
            .getOrElse(ServiceScopeEnum.LOCAL)
        : originalService.service_metadata.scope,
    // Only Admin can override token_name
    token_name: isAdminUser(user)
      ? payload.service_metadata?.token_name
      : originalService.service_metadata?.token_name
  };

  return {
    ...originalService,
    ...filteredPayload,
    service_metadata: withoutUndefinedValues(serviceMetadata)
  };
};
