import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../generated/api/ServiceId";
import * as config from "../config";
import { JiraAPIClient } from "../jira_client";

const JIRA_CONFIG = {
  JIRA_BOARD: "BOARD",
  JIRA_DELEGATE_ID_FIELD: "",
  JIRA_EMAIL_ID_FIELD: "",
  JIRA_NAMESPACE_URL: "board.atlassian.com",
  JIRA_ORGANIZATION_ID_FIELD: "",
  JIRA_SERVICE_TAG_PREFIX: "SERVICE-",
  JIRA_STATUS_COMPLETE: "COMPLETE",
  JIRA_STATUS_IN_PROGRESS: "REVIEW",
  JIRA_STATUS_NEW: "NEW",
  JIRA_STATUS_REJECTED: "REJECTED",
  JIRA_TOKEN: "token",
  JIRA_TRANSITION_REJECT_ID: "112",
  JIRA_TRANSITION_START_ID: "113",
  JIRA_TRANSITION_UPDATED_ID: "114"
} as config.IJIRA_CONFIG;
const aJiraCardIssueId = "1" as NonEmptyString;
const serviceID: ServiceId = "TEST-SERVICE-ID" as ServiceId;
const mockFetchJson = jest.fn();
const getMockFetchWithStatus = (status: number) =>
  jest.fn().mockImplementation(async () => ({
    json: mockFetchJson,
    status
  }));

const aCreateJiraIssueResponse = {
  id: aJiraCardIssueId,
  key: "issueCardKey"
};

const aSearchJiraIssueResponse = {
  startAt: 0,
  total: 1,

  issues: [
    {
      fields: {
        assignee: {},
        comment: {
          comments: [],
          maxResults: 50,
          self: "http://",
          startAt: 0,
          total: 0
        },
        labels: {},
        status: {
          name: "name"
        },
        summary: "summary"
      },
      id: aJiraCardIssueId,
      key: "1",
      self: "http://"
    }
  ]
};

describe("JiraAPIClient#createJiraIssue", () => {
  it("should create a Issue with right parameters", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve(aCreateJiraIssueResponse)
    );
    const mockFetch = getMockFetchWithStatus(201);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      {
        boardId: JIRA_CONFIG.JIRA_BOARD,
        delegateIdField: JIRA_CONFIG.JIRA_DELEGATE_ID_FIELD,
        emailIdField: JIRA_CONFIG.JIRA_EMAIL_ID_FIELD,
        jiraEmail: (JIRA_CONFIG.JIRA_USERNAME as unknown) as NonEmptyString,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
        serviceTagPrefix: JIRA_CONFIG.JIRA_SERVICE_TAG_PREFIX,
        statusComplete: JIRA_CONFIG.JIRA_STATUS_COMPLETE,
        token: JIRA_CONFIG.JIRA_TOKEN
      },
      mockFetch
    );
    const issue = await client
      .createJiraIssue(
        "Titolo della Card" as NonEmptyString,
        "Descrizione della card" as NonEmptyString,
        {
          delegateName: "firstName lastName" as NonEmptyString,
          email: "test@email.com" as EmailString,
          organizationName: "MyOrganizationName" as NonEmptyString,
          serviceId: (ServiceId as unknown) as NonEmptyString
        },
        ["TEST" as NonEmptyString]
      )
      .run();

    expect(mockFetch).toBeCalledWith(expect.any(String), {
      body: expect.any(String),
      headers: expect.any(Object),
      method: "POST"
    });
    expect(issue.isRight()).toBeTruthy();
    expect(issue.value).toHaveProperty("id", aCreateJiraIssueResponse.id);
    expect(issue.value).toHaveProperty("key", aCreateJiraIssueResponse.key);
  });
});

describe("JiraAPIClient#search and apply transition", () => {
  it("should find an issue with a specific serviceId", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve(aSearchJiraIssueResponse)
    );
    const mockFetch = getMockFetchWithStatus(200);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      {
        boardId: JIRA_CONFIG.JIRA_BOARD,
        delegateIdField: JIRA_CONFIG.JIRA_DELEGATE_ID_FIELD,
        emailIdField: JIRA_CONFIG.JIRA_EMAIL_ID_FIELD,
        jiraEmail: (JIRA_CONFIG.JIRA_USERNAME as unknown) as NonEmptyString,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
        serviceTagPrefix: JIRA_CONFIG.JIRA_SERVICE_TAG_PREFIX,
        statusComplete: JIRA_CONFIG.JIRA_STATUS_COMPLETE,
        token: JIRA_CONFIG.JIRA_TOKEN
      },
      mockFetch
    );

    const searchResponse = await client
      .searchServiceJiraIssue({
        serviceId: serviceID
      })
      .run();
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
      body: expect.any(String),
      headers: expect.any(Object),
      method: "POST"
    });
    expect(searchResponse.isRight()).toBeTruthy();
    expect(searchResponse.value).toEqual(aSearchJiraIssueResponse);
  });
  it("should find a serviceId in New", async () => {
    mockFetchJson.mockImplementationOnce(() =>
      Promise.resolve(aSearchJiraIssueResponse)
    );
    const mockFetch = getMockFetchWithStatus(200);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      {
        boardId: JIRA_CONFIG.JIRA_BOARD,
        delegateIdField: JIRA_CONFIG.JIRA_DELEGATE_ID_FIELD,
        emailIdField: JIRA_CONFIG.JIRA_EMAIL_ID_FIELD,
        jiraEmail: (JIRA_CONFIG.JIRA_USERNAME as unknown) as NonEmptyString,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
        serviceTagPrefix: JIRA_CONFIG.JIRA_SERVICE_TAG_PREFIX,
        statusComplete: JIRA_CONFIG.JIRA_STATUS_COMPLETE,
        token: JIRA_CONFIG.JIRA_TOKEN
      },
      mockFetch
    );
    const searchResponse = await client
      .getServiceJiraIssuesByStatus({
        serviceId: serviceID,
        status: JIRA_CONFIG.JIRA_STATUS_NEW
      })
      .run();
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
      body: expect.any(String),
      headers: expect.any(Object),
      method: "POST"
    });
    // We expect to don't have any total from search issue
    expect(searchResponse.isRight()).toBeTruthy();
    expect(searchResponse.value).toEqual(aSearchJiraIssueResponse);
  });
  it("should move an Issue from New to New cross other states", async () => {
    const mockFetch = getMockFetchWithStatus(204);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      {
        boardId: JIRA_CONFIG.JIRA_BOARD,
        delegateIdField: JIRA_CONFIG.JIRA_DELEGATE_ID_FIELD,
        emailIdField: JIRA_CONFIG.JIRA_EMAIL_ID_FIELD,
        jiraEmail: (JIRA_CONFIG.JIRA_USERNAME as unknown) as NonEmptyString,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
        serviceTagPrefix: JIRA_CONFIG.JIRA_SERVICE_TAG_PREFIX,
        statusComplete: JIRA_CONFIG.JIRA_STATUS_COMPLETE,
        token: JIRA_CONFIG.JIRA_TOKEN
      },
      mockFetch
    );
    const aJiraIssueTransitionResponse = await client
      .applyJiraIssueTransition(
        aJiraCardIssueId, // IssueID or Key
        JIRA_CONFIG.JIRA_TRANSITION_START_ID, // TransitionId
        "Da New a In Review" as NonEmptyString // Comment,
      )
      .run();
    expect(aJiraIssueTransitionResponse.isRight()).toBeTruthy();
    expect(aJiraIssueTransitionResponse.value).toEqual("OK");
  });
});
