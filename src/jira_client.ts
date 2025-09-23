import { toError } from "fp-ts/lib/Either";
import { fromNullable } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import nodeFetch from "node-fetch";
import { EmailAddress } from "../generated/api/EmailAddress";
import { ServiceId } from "../generated/api/ServiceId";
import * as E from "fp-ts/lib/Either";
import { convert } from "adf-to-md";

export interface IJiraConfig {
  readonly boardId: NonEmptyString;
  readonly delegateIdField: NonEmptyString;
  readonly emailIdField: NonEmptyString;
  readonly organizationIdField: NonEmptyString;
  readonly jiraEmail: EmailAddress;
  readonly statusComplete: NonEmptyString;
  readonly token: NonEmptyString;
}

export const JIRA_SERVICE_TAG_PREFIX = "devportal-service-";

export const JIRA_DISABLE_LABEL = "DISATTIVAZIONE";

const ADF = t.type({
  content: t.readonlyArray(t.unknown),
  type: t.string,
  version: t.number
});
type ADF = t.TypeOf<typeof ADF>;

export const StringFromADF = new t.Type<string, ADF>(
  "StringFromADF",
  (s): s is string => typeof s === "string",
  (i, ctx) =>
    ADF.decode(i)
      .mapLeft(readableReport)
      .chain(adf =>
        E.tryCatch2v(
          () => convert(adf),
          e => `ADF conversion failed: ${E.toError(e).message}`
        )
      )
      .fold(
        error => t.failure(i, ctx, error),
        value => t.success(value.result)
      ),
  () => {
    throw new Error("Cannot convert markdown to adf object");
  }
);

export const SearchJiraIssueResponse = t.interface({
  issues: t.readonlyArray(
    t.interface({
      id: NonEmptyString,
      key: NonEmptyString,
      self: NonEmptyString,

      fields: t.interface({
        assignee: t.union([t.null, t.any]),
        comment: t.interface({
          comments: t.readonlyArray(
            t.type({ body: StringFromADF, created: NonEmptyString })
          )
        }),
        labels: t.union([t.null, t.any]),
        status: t.interface({
          name: t.string
        }),
        summary: t.string
      })
    })
  )
});
export type SearchJiraIssueResponse = t.TypeOf<typeof SearchJiraIssueResponse>;

export const CreateJiraIssueResponse = t.interface({
  id: NonEmptyString,

  key: NonEmptyString
});
export type CreateJiraIssueResponse = t.TypeOf<typeof CreateJiraIssueResponse>;

export const CreateJiraCommentIssueResponse = t.interface({
  id: NonEmptyString,

  body: NonEmptyString
  // Other properties are not relevant.
});
export type CreateJiraCommentIssueResponse = t.TypeOf<
  typeof CreateJiraCommentIssueResponse
>;

const JiraIssueSearchPayload = t.interface({
  expand: t.string,
  fields: t.array(t.string),
  fieldsByKeys: t.boolean,
  jql: t.string
});
type JiraIssueSearchPayload = t.TypeOf<typeof JiraIssueSearchPayload>;

export interface IJiraAPIClient {
  readonly createJiraIssue: (
    title: NonEmptyString,
    description: NonEmptyString,
    serviceData: {
      readonly delegateName: NonEmptyString;
      readonly email: EmailString;
      readonly organizationName: NonEmptyString;
      readonly serviceId: NonEmptyString;
    },
    labels?: ReadonlyArray<NonEmptyString>
  ) => TaskEither<Error, CreateJiraIssueResponse>;
  readonly createJiraIssueComment: (
    issueId: NonEmptyString,
    comment: NonEmptyString
  ) => TaskEither<Error, CreateJiraCommentIssueResponse>;
  readonly getServiceJiraIssuesByStatus: (params: {
    readonly serviceId: ServiceId;
    readonly status: NonEmptyString;
  }) => TaskEither<Error, SearchJiraIssueResponse>;
  readonly searchServiceJiraIssue: (params: {
    readonly serviceId: ServiceId;
  }) => TaskEither<Error, SearchJiraIssueResponse>;
  readonly applyJiraIssueTransition: (
    issueId: NonEmptyString,
    transitionId: NonEmptyString,
    newComment?: NonEmptyString
  ) => TaskEither<Error, "OK">;
  readonly deleteJiraIssue: (
    issueId: NonEmptyString
  ) => TaskEither<Error, "OK">;
}

export function JiraAPIClient(
  baseUrl: NonEmptyString,
  config: IJiraConfig,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): IJiraAPIClient {
  const jiraHeaders = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(
      `${config.jiraEmail}:${config.token}`
    ).toString("base64")}`,
    "Content-Type": "application/json"
  };
  const jiraIssueSearch = (bodyData: JiraIssueSearchPayload) =>
    tryCatch(() => {
      return fetchApi(`${baseUrl}/rest/api/3/search/jql`, {
        body: JSON.stringify(bodyData),
        headers: jiraHeaders,
        method: "POST"
      });
    }, toError).chain<SearchJiraIssueResponse>(_ => {
      if (_.status >= 500) {
        return fromLeft(new Error("Jira API returns an error"));
      }
      if (_.status === 401) {
        return fromLeft(new Error("Jira secrets misconfiguration"));
      }
      if (_.status === 400) {
        return fromLeft(new Error("Wrong Jira JQL"));
      }
      if (_.status !== 200) {
        return fromLeft(new Error("Unknown status code response error"));
      }
      return tryCatch(() => _.json(), toError).chain(responseBody => {
        return fromEither(
          SearchJiraIssueResponse.decode(responseBody).mapLeft(errors => {
            return toError(readableReport(errors));
          })
        );
      });
    });
  const createJiraIssue = (
    title: NonEmptyString,
    description: NonEmptyString,
    serviceData: {
      readonly delegateName: NonEmptyString;
      readonly email: EmailString;
      readonly organizationName: NonEmptyString;
      readonly serviceId: NonEmptyString;
    },
    labels?: ReadonlyArray<NonEmptyString>
  ) => {
    return tryCatch(
      () =>
        fetchApi(`${baseUrl}/rest/api/2/issue`, {
          body: JSON.stringify({
            fields: {
              description,
              issuetype: {
                name: "Task"
              },
              [`${config.delegateIdField}`]: `${serviceData.delegateName}`,
              [`${config.emailIdField}`]: `${serviceData.email}`,
              [`${config.organizationIdField}`]: `${serviceData.organizationName}`,
              labels: [
                `${JIRA_SERVICE_TAG_PREFIX}${serviceData.serviceId}`
              ].concat(labels || []),
              project: {
                key: config.boardId
              },
              summary: title
            }
          }),
          headers: jiraHeaders,
          method: "POST"
        }),
      toError
    ).chain<CreateJiraIssueResponse>(_ => {
      if (_.status >= 500) {
        return fromLeft(new Error("Jira API returns an error"));
      }
      if (_.status === 401) {
        return fromLeft(new Error("Jira secrets misconfiguration"));
      }
      if (_.status === 400) {
        return fromLeft(new Error("Invalid request"));
      }
      if (_.status !== 201) {
        return fromLeft(new Error("Unknown status code response error"));
      }
      return tryCatch(() => _.json(), toError).chain(responseBody =>
        fromEither(
          CreateJiraIssueResponse.decode(responseBody).mapLeft(errors =>
            toError(readableReport(errors))
          )
        )
      );
    });
  };

  const deleteJiraIssue = (issueId: NonEmptyString) =>
    tryCatch(
      () =>
        fetchApi(`${baseUrl}/rest/api/2/issue/${issueId}`, {
          headers: jiraHeaders,
          method: "DELETE"
        }),
      toError
    ).chain<"OK">(_ => {
      if (_.status >= 500) {
        return fromLeft(new Error("Jira API returns an error"));
      }
      if (_.status === 401) {
        return fromLeft(new Error("Jira secrets misconfiguration"));
      }
      if (_.status === 400) {
        return fromLeft(new Error("Invalid request"));
      }
      if (_.status !== 204) {
        return fromLeft(new Error("Unknown status code response error"));
      }
      return taskEither.of("OK");
    });

  const createJiraIssueComment = (
    issueId: NonEmptyString,
    comment: NonEmptyString
  ) =>
    tryCatch(
      () =>
        fetchApi(`${baseUrl}/rest/api/2/issue/${issueId}/comment`, {
          body: JSON.stringify({
            body: comment
          }),
          headers: jiraHeaders,
          method: "POST"
        }),
      toError
    ).chain<CreateJiraCommentIssueResponse>(_ => {
      if (_.status >= 500) {
        return fromLeft(new Error("Jira API returns an error"));
      }
      if (_.status === 401) {
        return fromLeft(new Error("Jira secrets misconfiguration"));
      }
      if (_.status === 400) {
        return fromLeft(new Error("Invalid request"));
      }
      if (_.status !== 201) {
        return fromLeft(new Error("Unknown status code response error"));
      }
      return tryCatch(() => _.json(), toError).chain(responseBody =>
        fromEither(
          CreateJiraCommentIssueResponse.decode(responseBody).mapLeft(errors =>
            toError(readableReport(errors))
          )
        )
      );
    });

  const getServiceJiraIssuesByStatus = (params: {
    readonly serviceId: ServiceId;
    readonly status: NonEmptyString;
  }) => {
    const bodyData: JiraIssueSearchPayload = {
      expand: "names",
      fields: ["summary", "status", "assignee", "comment"],
      fieldsByKeys: false,
      jql: `project = ${config.boardId} AND issuetype = Task AND (labels = ${JIRA_SERVICE_TAG_PREFIX}${params.serviceId} OR (labels = ${JIRA_SERVICE_TAG_PREFIX}${params.serviceId} AND labels = ${JIRA_DISABLE_LABEL})) AND status = ${params.status} ORDER BY created DESC`
    };
    return jiraIssueSearch(bodyData);
  };

  const searchServiceJiraIssue = (params: {
    readonly serviceId: ServiceId;
  }) => {
    const bodyData: JiraIssueSearchPayload = {
      expand: "names",
      fields: ["summary", "status", "assignee", "comment", "labels"],
      fieldsByKeys: false,
      // Check if is better without JIRA_SERVICE_TAG_PREFIX
      jql: `project = ${config.boardId} AND issuetype = Task AND (labels = ${JIRA_SERVICE_TAG_PREFIX}${params.serviceId} AND status != ${config.statusComplete}) ORDER BY created DESC`
    };
    return jiraIssueSearch(bodyData);
  };
  const applyJiraIssueTransition = (
    issueId: NonEmptyString,
    transitionId: NonEmptyString,
    newComment?: NonEmptyString
  ) => {
    return tryCatch(() => {
      return fetchApi(`${baseUrl}/rest/api/2/issue/${issueId}/transitions`, {
        body: JSON.stringify({
          ...fromNullable(newComment)
            .map(_ => ({
              update: {
                comment: [
                  {
                    add: {
                      body: _
                    }
                  }
                ]
              }
            }))
            .toUndefined(),
          transition: {
            id: transitionId
          }
        }),
        headers: jiraHeaders,
        method: "POST"
      });
    }, toError).chain<"OK">(_ => {
      if (_.status >= 500) {
        return fromLeft(new Error("Jira API returns an error"));
      }
      if (_.status === 404) {
        return fromLeft(new Error("Jira issue not found"));
      }
      if (_.status === 401) {
        return fromLeft(new Error("Jira secrets misconfiguration"));
      }
      if (_.status === 400) {
        return fromLeft(new Error("Invalid request"));
      }
      if (_.status !== 204) {
        return fromLeft(new Error("Unknown status code response error"));
      }
      return taskEither.of("OK");
    });
  };

  return {
    applyJiraIssueTransition,
    createJiraIssue,
    createJiraIssueComment,
    deleteJiraIssue,
    getServiceJiraIssuesByStatus,
    searchServiceJiraIssue
  };
}
