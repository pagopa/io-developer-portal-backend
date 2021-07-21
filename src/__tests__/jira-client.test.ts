import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../generated/api/ServiceId";
import * as config from "../config";
import { JiraAPIClient } from "../jira_client";

const JIRA_CONFIG = config.getJiraConfigOrThrow();
const serviceID: ServiceId = "TEST-SERVICE-ID" as ServiceId;

describe("JiraAPIClient#createJiraIssue", () => {
  let sandbox: { issue: { id: string & NonEmptyString } };

  it("should create a Issue with right parameters", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const issue = await client
      .createJiraIssue(
        "Titolo della Card" as NonEmptyString,
        "Descrizione della card" as NonEmptyString,
        serviceID,
        ["TEST" as NonEmptyString]
      )
      .run();
    issue.isRight() ? (sandbox = { issue: issue.value }) : null;
    issue.isRight() && expect(issue.value.id).not.toBeUndefined;
  });
  afterAll(async () => {
    console.log("Deleting jira issue card created:", sandbox.issue.id);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );

    await client.deleteJiraIssue(sandbox.issue.id).run();
  });
});

describe("JiraAPIClient#search and apply transition", () => {
  let sandbox: { issue: { id: string & NonEmptyString } };
  beforeAll(async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
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
    issue.isRight() ? (sandbox = { issue: issue.value }) : null;
  });
  it("should find an issue with a specific serviceId", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .searchServiceJiraIssue({
        serviceId: serviceID
      })
      .run();
    a.isRight() && expect(a.value.total).toBeGreaterThan(0);
  });
  it("should find a serviceId in New", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .getServiceJiraIssuesByStatus({
        serviceId: serviceID,
        status: JIRA_CONFIG.JIRA_STATUS_NEW_ID
      })
      .run();
    // We expect to don't have any total from search issue
    a.isRight() && expect(a.value.total).toEqual(0);
  });
  it("should move an Issue from New to New cross other states", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .applyJiraIssueTransition(
        sandbox.issue.id as NonEmptyString, // IssueID or Key
        JIRA_CONFIG.JIRA_TRANSITION_START_ID, // "11" as NonEmptyString, // TransitionId
        "Da New a In Review" as NonEmptyString // Comment,
      )
      .chain(_ =>
        client.applyJiraIssueTransition(
          sandbox.issue.id as NonEmptyString, // IssueID or Key
          JIRA_CONFIG.JIRA_TRANSITION_REJECT_ID, // "11" as NonEmptyString, // TransitionId
          "Da Review a Rejected" as NonEmptyString // Comment,
        )
      )
      .chain(_ =>
        client.applyJiraIssueTransition(
          sandbox.issue.id as NonEmptyString, // IssueID or Key
          JIRA_CONFIG.JIRA_TRANSITION_UPDATED_ID, // "11" as NonEmptyString, // TransitionId
          "Da Rejected a New" as NonEmptyString // Comment,
        )
      )
      .run();
    expect(a.isRight()).toBeTruthy();
  });

  afterAll(async () => {
    console.log("Deleting jira issue card created:", sandbox.issue.id);
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );

    await client.deleteJiraIssue(sandbox.issue.id).run();
  });
});
