import { toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromLeft,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import nodeFetch from "node-fetch";
import { ServiceId } from "../generated/api/ServiceId";

export const JIRA_SERVICE_TAG_PREFIX = "devportal-service-";

export const SearchJiraIssueResponse = t.interface({
  startAt: t.number,
  total: t.number,

  issues: t.readonlyArray(
    t.interface({
      id: NonEmptyString,
      key: NonEmptyString,
      self: NonEmptyString,

      fields: t.interface({
        assignee: t.union([t.null, t.any]),
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
  expand: t.array(t.string),
  fields: t.array(t.string),
  fieldsByKeys: t.boolean,
  jql: t.string,
  startAt: t.number
});
type JiraIssueSearchPayload = t.TypeOf<typeof JiraIssueSearchPayload>;

const jiraIssueSearch = (
  baseUrl: string,
  jiraEmail: string,
  token: string,
  bodyData: JiraIssueSearchPayload,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
) =>
  tryCatch(
    () =>
      fetchApi(`${baseUrl}/rest/api/2/search`, {
        method: "POST",

        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${jiraEmail}:${token}`).toString(
            "base64"
          )}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify(bodyData)
      }),
    toError
  ).chain<SearchJiraIssueResponse>(_ => {
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
    return tryCatch(() => _.json(), toError).chain(responseBody =>
      fromEither(
        SearchJiraIssueResponse.decode(responseBody).mapLeft(errors =>
          toError(readableReport(errors))
        )
      )
    );
  });

export interface IJiraAPIClient {
  readonly createJiraIssue: (
    title: NonEmptyString,
    description: NonEmptyString,
    serviceId: NonEmptyString
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
    transitionKey: NonEmptyString,
    newComment?: NonEmptyString
  ) => TaskEither<Error, "OK">;
}

export function JiraAPIClient(
  baseUrl: string,
  jiraEmail: string,
  token: string,
  boardId: string,
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): IJiraAPIClient {
  const createJiraIssue = (
    title: NonEmptyString,
    description: NonEmptyString,
    serviceId: NonEmptyString
  ) =>
    tryCatch(
      () =>
        fetchApi(`${baseUrl}/rest/api/2/issue`, {
          method: "POST",

          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(
              `${jiraEmail}:${token}`
            ).toString("base64")}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            fields: {
              description,
              issueType: {
                name: "Task"
              },
              labels: [`${JIRA_SERVICE_TAG_PREFIX}${serviceId}`],
              project: {
                key: boardId
              },
              summary: title
            }
          })
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
  const createJiraIssueComment = (
    issueId: NonEmptyString,
    comment: NonEmptyString
  ) =>
    tryCatch(
      () =>
        fetchApi(`${baseUrl}/rest/api/2/issue/${issueId}/comment`, {
          method: "POST",

          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(
              `${jiraEmail}:${token}`
            ).toString("base64")}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            body: comment
          })
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
      expand: ["names"],
      fields: ["summary", "status", "assignee"],
      fieldsByKeys: false,
      jql: `project = ${boardId} AND issuetype = Task AND labels = ${JIRA_SERVICE_TAG_PREFIX}${params.serviceId} AND status = ${params.status} ORDER BY created DESC`,
      startAt: 0
    };
    return jiraIssueSearch(baseUrl, jiraEmail, token, bodyData, fetchApi);
  };
  const searchServiceJiraIssue = (params: {
    readonly serviceId: ServiceId;
  }) => {
    const bodyData: JiraIssueSearchPayload = {
      expand: ["names"],
      fields: ["summary", "status", "assignee"],
      fieldsByKeys: false,
      jql: `project = ${boardId} AND issuetype = Task AND labels = ${JIRA_SERVICE_TAG_PREFIX}${params.serviceId} ORDER BY created DESC`,
      startAt: 0
    };
    return jiraIssueSearch(baseUrl, jiraEmail, token, bodyData, fetchApi);
  };
  const applyJiraIssueTransition = (
    issueId: NonEmptyString,
    transitionKey: NonEmptyString,
    newComment?: NonEmptyString
  ) =>
    tryCatch(
      () =>
        fetchApi(`${baseUrl}/rest/api/2/issue/${issueId}/transitions`, {
          method: "POST",

          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(
              `${jiraEmail}:${token}`
            ).toString("base64")}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            ...(newComment
              ? {
                  update: {
                    comment: [
                      {
                        add: {
                          body: newComment
                        }
                      }
                    ]
                  }
                }
              : {}),
            transition: {
              key: transitionKey
            }
          })
        }),
      toError
    ).chain<"OK">(_ => {
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
  return {
    applyJiraIssueTransition,
    createJiraIssue,
    createJiraIssueComment,
    getServiceJiraIssuesByStatus,
    searchServiceJiraIssue
  };
}
