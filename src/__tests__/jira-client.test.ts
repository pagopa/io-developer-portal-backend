import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../generated/api/ServiceId";
import * as config from "../config";
import { JiraAPIClient } from "../jira_client";

const JIRA_CONFIG = config.getJiraConfigOrThrow();

describe("JiraAPIClient#searchServiceJiraIssue", () => {
  it("should success with right parameters", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .searchServiceJiraIssue({
        serviceId: "01EYNQ0864HKYR1Q9PXPJ18W7G" as ServiceId
      })
      .run();
    expect(a.isRight()).toBeTruthy();
  });
});

describe("JiraAPIClient#getServiceJiraIssuesByStatus", () => {
  it("should success with right parameters", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .getServiceJiraIssuesByStatus({
        serviceId: "123456789" as ServiceId,
        status: "NEW" as NonEmptyString
      })
      .run();
    expect(a.isRight()).toBeTruthy();
  });
});

describe("JiraAPIClient#createJiraIssue", () => {
  it("should create a Issue with right parameters", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .createJiraIssue(
        "Titolo della Card" as NonEmptyString,
        "Descrizione della card" as NonEmptyString,
        "IDSERVIZIOIVANLORENZO" as NonEmptyString,
        ["DISATTIVAZIONE" as NonEmptyString]
      )
      .run();
    expect(a.isRight()).toBeTruthy();
  });
});

describe("JiraAPIClient#applyJiraIssueTransition", () => {
  it("should move an Issue from Rejected to New", async () => {
    const client = JiraAPIClient(
      JIRA_CONFIG.JIRA_NAMESPACE_URL,
      JIRA_CONFIG.JIRA_USERNAME,
      JIRA_CONFIG.JIRA_TOKEN,
      JIRA_CONFIG.JIRA_BOARD
    );
    const a = await client
      .applyJiraIssueTransition(
        "DMT-12" as NonEmptyString, // IssueID or Key
        "41" as NonEmptyString, // TransitionId
        "Questo è un commento di transition" as NonEmptyString // Comment,
      )
      .run();
    expect(a.isRight()).toBeTruthy();
  });
});
