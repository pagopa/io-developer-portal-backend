import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../generated/api/ServiceId";
import * as config from "../config";
import { JiraAPIClient, StringFromADF } from "../jira_client";
import * as E from "fp-ts/lib/Either";

const JIRA_CONFIG = {
  JIRA_BOARD: "BOARD",
  JIRA_DELEGATE_ID_FIELD: "",
  JIRA_EMAIL_ID_FIELD: "",
  JIRA_NAMESPACE_URL: "board.atlassian.com",
  JIRA_ORGANIZATION_ID_FIELD: "",
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
  issues: [
    {
      fields: {
        assignee: {},
        comment: {
          comments: []
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
        jiraEmail: JIRA_CONFIG.JIRA_USERNAME,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
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
        jiraEmail: JIRA_CONFIG.JIRA_USERNAME,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
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
        jiraEmail: JIRA_CONFIG.JIRA_USERNAME,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
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
        jiraEmail: JIRA_CONFIG.JIRA_USERNAME,
        organizationIdField: JIRA_CONFIG.JIRA_ORGANIZATION_ID_FIELD,
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

describe("JiraAPIClient type check for StringFromADF", () => {
  const comment = "Questo è un commento";
  const validADF = {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: comment
          }
        ]
      }
    ]
  };
  const validADFString = JSON.stringify(validADF);

  it("should decode a valid ADF object to string", () => {
    const result = StringFromADF.decode(validADF);
    expect(E.isRight(result)).toBeTruthy();
    if (E.isRight(result)) {
      expect(result.value).toBe(comment);
    }
  });

  it("should throw error when encoding", () => {
    expect(() => StringFromADF.encode(validADFString)).toThrow(
      "Cannot convert markdown to adf object"
    );
  });

  it("should fail to decode an invalid ADF object", () => {
    const invalidADF = {
      type: "doc",
      invalidField: "value"
    };

    const result = StringFromADF.decode(invalidADF);
    expect(E.isLeft(result)).toBeTruthy();
  });

  it("should return empty string for wrong nested ADF", () => {
    const invalidADF = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "unknown_node_type", text: "should be ignored" }]
        }
      ]
    };

    const result = StringFromADF.decode(invalidADF);
    expect(E.isRight(result)).toBeTruthy();
    if (E.isRight(result)) {
      expect(result.value).toBe("");
    }
  });

  it("should fail to decode a non-object input", () => {
    const result = StringFromADF.decode("not an object");
    expect(E.isLeft(result)).toBeTruthy();
  });

  it("should validate string type correctly", () => {
    expect(StringFromADF.is("valid string")).toBe(true);
    expect(StringFromADF.is(123)).toBe(false);
    expect(StringFromADF.is(null)).toBe(false);
    expect(StringFromADF.is({})).toBe(false);
  });
});
