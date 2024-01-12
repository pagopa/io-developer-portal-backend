import ApiManagementClient from "azure-arm-apimanagement";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  IResponseErrorConflict,
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  IResponseSuccessRedirectToResource,
  ResponseErrorConflict,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import {
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import { ServicePublic } from "../../generated/api/ServicePublic";
import { APIClient, toEither } from "../api_client";
import {
  getApimUser,
  getUserSubscription,
  isAdminUser,
  parseOwnerIdFullPath
} from "../apim_operations";
import * as config from "../config";
import { getApimAccountEmail, SessionUser } from "../utils/session";

import { withDefault } from "italia-ts-commons/lib/types";
import { Service } from "../../generated/api/Service";
import { logger } from "../logger";

import * as t from "io-ts";

import { DepartmentName } from "../../generated/api/DepartmentName";
import { Logo as ApiLogo } from "../../generated/api/Logo";
import { MaxAllowedPaymentAmount } from "../../generated/api/MaxAllowedPaymentAmount";
import { OrganizationName } from "../../generated/api/OrganizationName";
import { ServiceId } from "../../generated/api/ServiceId";
import { ServiceMetadata } from "../../generated/api/ServiceMetadata";
import { ServiceName } from "../../generated/api/ServiceName";

import { identity } from "fp-ts/lib/function";
import { fromPredicate, taskEither } from "fp-ts/lib/TaskEither";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { CIDR } from "../../generated/api/CIDR";
import { CmsRestClient } from "../cms_api_client";
import { getServicePayloadUpdater } from "../conversions";
import { IJiraAPIClient, SearchJiraIssueResponse } from "../jira_client";
import {
  checkAdminTask,
  getApimUserTask,
  getUserSubscriptionTask,
  uploadOrganizationLogoTask,
  uploadServiceLogoTask
} from "../middlewares/upload_logo";
import { IStorageQueueClient } from "../storage_queue_client";

export const ServicePayload = t.partial({
  authorized_cidrs: t.readonlyArray(CIDR, "array of CIDR"),
  authorized_recipients: t.readonlyArray(FiscalCode, "array of FiscalCode"),
  department_name: DepartmentName,
  is_visible: withDefault(t.boolean, false),
  max_allowed_payment_amount: MaxAllowedPaymentAmount,
  organization_fiscal_code: OrganizationFiscalCode,
  organization_name: OrganizationName,
  require_secure_channels: withDefault(t.boolean, false),
  service_metadata: ServiceMetadata,
  service_name: ServiceName
});

export type ServicePayload = t.TypeOf<typeof ServicePayload>;

export const notificationApiClient = APIClient(
  config.adminApiUrl,
  config.adminApiKey
);

const ReviewStatus = t.partial({
  comment: t.interface({
    comments: t.readonlyArray(
      t.interface({
        body: t.string, // comment text
        created: t.string // comment creation date
      })
    )
  }),
  detail: t.string,
  labels: t.readonlyArray(NonEmptyString),
  status: t.number,
  title: t.string
});

type ReviewStatus = t.TypeOf<typeof ReviewStatus>;

export type ErrorResponses =
  | IResponseErrorNotFound
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

/**
 * Get service data for a specific serviceId.
 */
export async function getService(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  serviceId: NonEmptyString
): Promise<
  | IResponseSuccessJson<Service>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );
  if (O.isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const apimUser = maybeApimUser.value;

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  // if the user is an admin we skip the check on userId

  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    isAdminUser(apimUser) ? undefined : apimUser.id
  );

  if (O.isNone(maybeSubscription)) {
    return ResponseErrorInternal("Cannot get user subscription");
  }

  const errorOrServiceResponse = toEither(
    await notificationApiClient.getService({
      id: serviceId
    })
  );

  if (E.isLeft(errorOrServiceResponse)) {
    return ResponseErrorNotFound(
      "Cannot get service",
      "Cannot get existing service"
    );
  }

  const service = errorOrServiceResponse.value;
  return ResponseSuccessJson(service);
}

const extractOwnerId = (
  fullPath?: string
): E.Either<IResponseErrorNotFound, NonEmptyString> => {
  const maybeFullPath = O.fromNullable(fullPath);
  if (O.isNone(maybeFullPath)) {
    return E.left(ResponseErrorNotFound("Not found", "ownerId not found"));
  }
  return E.right(parseOwnerIdFullPath(maybeFullPath.value as NonEmptyString));
};

/**
 * Update service data for/with a specific serviceId.
 */
export async function putService(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  serviceId: NonEmptyString,
  servicePayload: ServicePayload,
  cmsRestClient: CmsRestClient
): Promise<
  | IResponseSuccessJson<ServicePublic>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorConflict
> {
  try {
    const maybeApimUser = await getApimUser(
      apiClient,
      getApimAccountEmail(authenticatedUser)
    );
    if (O.isNone(maybeApimUser)) {
      return ResponseErrorNotFound(
        "API user not found",
        "Cannot find a user in the API management with the provided email address"
      );
    }
    const authenticatedApimUser = maybeApimUser.value;

    // Authenticates this request against the logged in user
    // checking that serviceId = subscriptionId
    // if the user is an admin we skip the check on userId
    const maybeSubscription = await getUserSubscription(
      apiClient,
      serviceId,
      isAdminUser(authenticatedApimUser) ? undefined : authenticatedApimUser.id
    );
    if (O.isNone(maybeSubscription)) {
      return ResponseErrorNotFound(
        "Subscription not found",
        "Cannot get a subscription for the logged in user"
      );
    }

    if (!isAdminUser(authenticatedApimUser)) {
      // Retrieve required params to call Services CMS internal API
      const userEmail = getApimAccountEmail(authenticatedUser);
      const maybeUserGroups = t
        .array(NonEmptyString)
        .decode(Array.from(authenticatedApimUser.groupDisplayNames || []));
      if (maybeUserGroups.isLeft()) {
        return ResponseErrorInternal(readableReport(maybeUserGroups.value));
      }
      const userGroups = maybeUserGroups.value;
      userGroups.push("ApiServiceWrite" as NonEmptyString);
      const maybeUserId = extractOwnerId(authenticatedApimUser.id);
      if (maybeUserId.isLeft()) {
        return maybeUserId.value;
      }
      const userId = maybeUserId.value;
      const subscriptionId = `MANAGE-${userId}` as NonEmptyString;

      const requiredServicesCmsParams = {
        subscriptionId,
        userEmail,
        userGroups,
        userId
      };

      const maybeServicePublication = await cmsRestClient.getServicePublication(
        serviceId,
        requiredServicesCmsParams
      );

      if (
        maybeServicePublication.isSome() &&
        maybeServicePublication.value.status === "published"
      ) {
        const maybeServiceLifecycle = await cmsRestClient.getServiceLifecycle(
          serviceId,
          requiredServicesCmsParams
        );
        if (
          maybeServiceLifecycle.isSome() &&
          maybeServiceLifecycle.value.status.value !== "approved"
        ) {
          return ResponseErrorConflict("sync_check_error");
        }
      }
    }

    // Get old service data
    const errorOrService = toEither(
      await notificationApiClient.getService({
        id: serviceId
      })
    );
    if (E.isLeft(errorOrService)) {
      return ResponseErrorNotFound(
        "Service not found",
        "Cannot get a service with the provided id."
      );
    }
    const service = errorOrService.value;

    const updatedService = getServicePayloadUpdater(authenticatedApimUser)(
      service,
      servicePayload
    );
    logger.debug("updating service %s", JSON.stringify(updatedService));

    const errorOrUpdatedService = toEither(
      await notificationApiClient.updateService({
        service: updatedService,
        serviceId
      })
    );

    return errorOrUpdatedService.fold<
      IResponseErrorInternal | IResponseSuccessJson<ServicePublic>
    >(
      errs => ResponseErrorInternal("Error updating service: " + errs.message),
      ResponseSuccessJson
    );
  } catch (e) {
    logger.error("An error has occurred while updating the service ", e);
    throw e;
  }
}

/**
 * Upload service logo for/with a specific serviceId.
 */
export async function putServiceLogo(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  serviceId: ServiceId,
  serviceLogo: ApiLogo
): Promise<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses> {
  return getApimUserTask(apiClient, authenticatedUser)
    .chain(user => getUserSubscriptionTask(apiClient, serviceId, user))
    .chain(() => uploadServiceLogoTask(serviceId, serviceLogo))
    .fold<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses>(
      identity,
      identity
    )
    .run();
}

/**
 * Upload organization logo for/with a specific serviceId.
 */
export async function putOrganizationLogo(
  apiClient: ApiManagementClient,
  authenticatedUser: SessionUser,
  organizationFiscalCode: OrganizationFiscalCode,
  serviceLogo: ApiLogo
): Promise<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses> {
  return getApimUserTask(apiClient, authenticatedUser)
    .chain(user => checkAdminTask(user))
    .chain(() =>
      uploadOrganizationLogoTask(organizationFiscalCode, serviceLogo)
    )
    .fold<IResponseSuccessRedirectToResource<{}, {}> | ErrorResponses>(
      identity,
      identity
    )
    .run();
}

export async function getReviewStatus(
  apiClient: ApiManagementClient,
  jiraClient: IJiraAPIClient,
  authenticatedUser: SessionUser,
  serviceId: NonEmptyString
): Promise<
  | IResponseSuccessJson<ReviewStatus>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorConflict
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );
  if (O.isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const authenticatedApimUser = maybeApimUser.value;

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  // if the user is an admin we skip the check on userId
  if (!isAdminUser(authenticatedApimUser)) {
    const maybeSubscription = await getUserSubscription(
      apiClient,
      serviceId,
      authenticatedApimUser.id
    );
    if (O.isNone(maybeSubscription)) {
      return ResponseErrorNotFound(
        "Subscription not found",
        "Cannot get a subscription for the logged in user"
      );
    }
  }

  return jiraClient
    .searchServiceJiraIssue({
      serviceId
    })
    .mapLeft<
      IResponseErrorConflict | IResponseErrorInternal | IResponseErrorNotFound
    >(_ => ResponseErrorInternal(_.message))
    .chain(
      fromPredicate(
        _ => _.total > 0,
        _ =>
          ResponseErrorNotFound(
            `Review Status: ${serviceId}`,
            `There isn't a review for this service ${serviceId}`
          )
      )
    )
    .chain(_ => taskEither.of(_.issues[0].fields))
    .fold<
      | IResponseSuccessJson<ReviewStatus>
      | IResponseErrorForbiddenNotAuthorized
      | IResponseErrorConflict
      | IResponseErrorInternal
      | IResponseErrorNotFound
    >(identity, card =>
      ResponseSuccessJson<ReviewStatus>({
        comment: card.comment,
        detail: card.status.name,
        labels: card.labels,
        status: 200,
        title: `Review Status: ${card.status} for ${serviceId}`
      })
    )
    .run();
}

export async function newDisableRequest(
  apiClient: ApiManagementClient,
  jiraClient: IJiraAPIClient,
  authenticatedUser: SessionUser,
  serviceId: NonEmptyString,
  jiraConfig: config.IJIRA_CONFIG
): Promise<
  | IResponseSuccessJson<ReviewStatus>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorConflict
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );
  if (O.isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const authenticatedApimUser = maybeApimUser.value;

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  // if the user is an admin we skip the check on userId

  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    authenticatedApimUser.id
  );
  if (O.isNone(maybeSubscription)) {
    return ResponseErrorNotFound(
      "Subscription not found",
      "Cannot get a subscription for the logged in user"
    );
  }

  const errorOrService = toEither(
    await notificationApiClient.getService({
      id: serviceId
    })
  );
  if (E.isLeft(errorOrService)) {
    return ResponseErrorNotFound(
      "Service not found",
      "Cannot get a service with the provided id."
    );
  }

  return jiraClient
    .getServiceJiraIssuesByStatus({
      serviceId,
      status: jiraConfig.JIRA_STATUS_IN_PROGRESS
    })
    .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(err =>
      ResponseErrorInternal(err.message)
    )
    .chain(
      fromPredicate(
        _ => _.total === 0,
        _ =>
          ResponseErrorConflict(
            "A review is already in progress for the service"
          )
      )
    )
    .chainSecond(
      jiraClient
        .getServiceJiraIssuesByStatus({
          serviceId,
          status: jiraConfig.JIRA_STATUS_NEW
        })
        .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(err =>
          ResponseErrorInternal(err.message)
        )
    )
    .chain(
      fromPredicate(
        _ => _.total === 0,
        _ =>
          ResponseErrorConflict(
            "A review is already in progress for the service"
          )
      )
    )
    .chain(_ =>
      jiraClient
        .createJiraIssue(
          `[DISATTIVAZIONE] servizio ${serviceId}` as NonEmptyString,
          `Effettua la disattivazione del servizio al link https://developer.io.italia.it/service/${serviceId}` as NonEmptyString,
          {
            delegateName: `${authenticatedUser.given_name} ${authenticatedUser.family_name}` as NonEmptyString,
            email: getApimAccountEmail(authenticatedUser),
            organizationName: errorOrService.value.organization_name,
            serviceId
          },
          ["DISATTIVAZIONE" as NonEmptyString]
        )
        .map(__ =>
          ResponseSuccessJson<ReviewStatus>({
            detail: "A new issue is created",
            status: 200,
            title: "Create new Issue"
          })
        )
        .mapLeft(err => ResponseErrorInternal(err.message))
    )
    .fold<
      | IResponseSuccessJson<ReviewStatus>
      | IResponseErrorForbiddenNotAuthorized
      | IResponseErrorConflict
      | IResponseErrorInternal
      | IResponseErrorNotFound
    >(identity, identity)
    .run();
}

export async function newReviewRequest(
  apiClient: ApiManagementClient,
  jiraClient: IJiraAPIClient,
  storageQueueClient: IStorageQueueClient,
  authenticatedUser: SessionUser,
  serviceId: NonEmptyString,
  jiraConfig: config.IJIRA_CONFIG
): Promise<
  | IResponseSuccessJson<ReviewStatus>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorConflict
  | IResponseErrorInternal
  | IResponseErrorNotFound
> {
  const maybeApimUser = await getApimUser(
    apiClient,
    getApimAccountEmail(authenticatedUser)
  );
  if (O.isNone(maybeApimUser)) {
    return ResponseErrorNotFound(
      "API user not found",
      "Cannot find a user in the API management with the provided email address"
    );
  }
  const authenticatedApimUser = maybeApimUser.value;

  // An admin cannot require a Service Review

  if (isAdminUser(authenticatedApimUser)) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  // Authenticates this request against the logged in user
  // checking that serviceId = subscriptionId
  // if the user is an admin we skip the check on userId

  const maybeSubscription = await getUserSubscription(
    apiClient,
    serviceId,
    authenticatedApimUser.id
  );
  if (O.isNone(maybeSubscription)) {
    return ResponseErrorNotFound(
      "Subscription not found",
      "Cannot get a subscription for the logged in user"
    );
  }

  const errorOrService = toEither(
    await notificationApiClient.getService({
      id: serviceId
    })
  );
  if (E.isLeft(errorOrService)) {
    return ResponseErrorNotFound(
      "Service not found",
      "Cannot get a service with the provided id."
    );
  }

  return (
    jiraClient
      .getServiceJiraIssuesByStatus({
        serviceId,
        status: jiraConfig.JIRA_STATUS_NEW
      })
      .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(err =>
        ResponseErrorInternal(err.message)
      )
      .chain(
        fromPredicate(
          _ => _.total === 0,
          _ =>
            ResponseErrorConflict(
              "A review is already in progress for the service"
            )
        )
      )
      .chainSecond(
        jiraClient
          .getServiceJiraIssuesByStatus({
            serviceId,
            status: jiraConfig.JIRA_STATUS_IN_PROGRESS
          })
          .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(err =>
            ResponseErrorInternal(err.message)
          )
          .chain(
            fromPredicate(
              _ => _.total === 0,
              _ =>
                ResponseErrorConflict(
                  "A review is already in progress for the service"
                )
            )
          )
      )
      // If exists Rejected Issue move blocked Jira Issue to NEW status
      .chainSecond(
        jiraClient
          .getServiceJiraIssuesByStatus({
            serviceId,
            status: jiraConfig.JIRA_STATUS_REJECTED
          })
          .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(err =>
            ResponseErrorInternal(err.message)
          )
      )
      .chain(rejectedIssues =>
        fromPredicate<SearchJiraIssueResponse, SearchJiraIssueResponse>(
          _ => _.total > 0,
          _ => _
        )(rejectedIssues).foldTaskEither(
          (_: SearchJiraIssueResponse) => taskEither.of(_),
          _ =>
            // Move rejected issue into new using updated transition id
            jiraClient
              .applyJiraIssueTransition(
                _.issues[0].id as NonEmptyString,
                jiraConfig.JIRA_TRANSITION_UPDATED_ID as NonEmptyString,
                "Il delegato ha richiesto una nuova review" as NonEmptyString
              )
              .mapLeft<IResponseErrorConflict | IResponseErrorInternal>(err =>
                ResponseErrorInternal(err.message)
              )
              .map(() => {
                storageQueueClient.insertNewMessage({
                  apimUserId: authenticatedApimUser.id,
                  isNewTicket: false,
                  serviceId,
                  ticketId: _.issues[0].id,
                  ticketKey: _.issues[0].key
                });
                return _;
              })
        )
      )
      .chain(_ => {
        if (_.issues.length > 0) {
          return taskEither.of(
            ResponseSuccessJson<ReviewStatus>({
              detail: "Moved",
              status: 200,
              title: "Issue Moved"
            })
          );
        } else {
          return jiraClient
            .createJiraIssue(
              `Review servizio ${serviceId}` as NonEmptyString,
              `Effettua la review del servizio al link https://developer.io.italia.it/service/${serviceId}` as NonEmptyString,
              {
                delegateName: `${authenticatedUser.given_name} ${authenticatedUser.family_name}` as NonEmptyString,
                // QUESTION: use delegate email?
                email: getApimAccountEmail(authenticatedUser),
                organizationName: errorOrService.value.organization_name,
                serviceId
              }
            )
            .map(__ => {
              storageQueueClient.insertNewMessage({
                apimUserId: authenticatedApimUser.id,
                isNewTicket: true,
                serviceId,
                ticketId: __.id,
                ticketKey: __.key
              });
              return ResponseSuccessJson<ReviewStatus>({
                detail: "A new issue is created",
                status: 201,
                title: "Create new Issue"
              });
            })
            .mapLeft(err => ResponseErrorInternal(err.message));
        }
      })
      .fold<
        | IResponseSuccessJson<ReviewStatus>
        | IResponseErrorForbiddenNotAuthorized
        | IResponseErrorConflict
        | IResponseErrorInternal
        | IResponseErrorNotFound
      >(identity, identity)
      .run()
  );
}
