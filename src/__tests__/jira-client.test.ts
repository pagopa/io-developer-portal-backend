import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../generated/api/ServiceId";
import * as config from "../config";
import { JiraAPIClient } from "../jira_client";

const JIRA_CONFIG = {
  JIRA_BOARD: "BOARD",
  JIRA_NAMESPACE_URL: "board.atlassian.com",
  JIRA_STATUS_COMPLETE: "COMPLETE",
  JIRA_STATUS_IN_PROGRESS: "REVIEW",
  JIRA_STATUS_NEW: "NEW",
  JIRA_STATUS_NEW_ID: "111",
  JIRA_STATUS_REJECTED: "REJECTED",
  JIRA_TOKEN: "token",
  JIRA_TRANSITION_REJECT_ID: "112",
  JIRA_TRANSITION_START_ID: "113",
  JIRA_TRANSITION_UPDATED_ID: "114"
} as config.IJIRA_CONFIG;

const serviceID: ServiceId = "TEST-SERVICE-ID" as ServiceId;

describe("JiraAPIClient#createJiraIssue", () => {
  // tslint:disable-next-line: no-let
  let sandbox: { readonly issue: { readonly id: string & NonEmptyString } };

  it("should create a Issue with right parameters", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );
    const issue = await client
      .createJiraIssue(
        "Titolo della Card" as NonEmptyString,
        "Descrizione della card" as NonEmptyString,
        serviceID,
        ["TEST" as NonEmptyString]
      )
      .run();
    // tslint:disable-next-line: no-unused-expression
    issue.isRight() ? (sandbox = { issue: issue.value }) : undefined;
    // tslint:disable-next-line: no-unused-expression
    issue.isRight() && expect(issue.value.id).not.toBeUndefined;
  });
  afterAll(async () => {
    // console.log("Deleting jira issue card created:", sandbox.issue.id);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );

    await client.deleteJiraIssue(sandbox.issue.id).run();
  });
});

describe("JiraAPIClient#search and apply transition", () => {
  // tslint:disable-next-line: no-let
  let sandbox: { readonly issue: { readonly id: string & NonEmptyString } };
  beforeAll(async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );
    // create a card
    const issue = await client
      .createJiraIssue(
        "Card Test" as NonEmptyString,
        "Card generata dal test - da rimuovere" as NonEmptyString,
        serviceID,
        ["TEST" as NonEmptyString]
      )
      .run();
    // tslint:disable-next-line: no-unused-expression
    issue.isRight() ? (sandbox = { issue: issue.value }) : undefined;
  });
  it("should find an issue with a specific serviceId", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );
    const a = await client
      .searchServiceJiraIssue({
        serviceId: serviceID
      })
      .run();
    // tslint:disable-next-line: no-unused-expression
    a.isRight() && expect(a.value.total).toBeGreaterThan(0);
  });
  it("should find a serviceId in New", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );
    const a = await client
      .getServiceJiraIssuesByStatus({
        serviceId: serviceID,
        status: JIRA_CONFIG.JIRA_STATUS_NEW_ID
      })
      .run();
    // We expect to don't have any total from search issue
    // tslint:disable-next-line: no-unused-expression
    a.isRight() && expect(a.value.total).toEqual(0);
  });
  it("should move an Issue from New to New cross other states", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );
    const a = await client
      .applyJiraIssueTransition(
        sandbox.issue.id as NonEmptyString, // IssueID or Key
        JIRA_CONFIG.JIRA_TRANSITION_START_ID, // TransitionId
        "Da New a In Review" as NonEmptyString // Comment,
      )
      .chain(_ =>
        client.applyJiraIssueTransition(
          sandbox.issue.id as NonEmptyString, // IssueID or Key
          JIRA_CONFIG.JIRA_TRANSITION_REJECT_ID, // TransitionId
          "Da Review a Rejected" as NonEmptyString // Comment,
        )
      )
      .chain(_ =>
        client.applyJiraIssueTransition(
          sandbox.issue.id as NonEmptyString, // IssueID or Key
          JIRA_CONFIG.JIRA_TRANSITION_UPDATED_ID, // TransitionId
          "Da Rejected a New" as NonEmptyString // Comment,
        )
      )
      .run();
    expect(a.isRight()).toBeTruthy();
  });

  afterAll(async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD,
      JIRA_CONFIG.JIRA_STATUS_COMPLETE
    );

    await client.deleteJiraIssue(sandbox.issue.id).run();
  });
});
