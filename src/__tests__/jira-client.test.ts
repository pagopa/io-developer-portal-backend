import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ServiceId } from "../../generated/api/ServiceId";
import { JiraAPIClient } from "../jira_client";

describe("JiraAPIClient#searchServiceJiraIssue", () => {
  it("should success with right parameters", async () => {
    const client = JiraAPIClient(
      "https://pagopa.atlassian.net",
      "daniele.manni@pagopa.it",
      "token",
      "DMT"
    );
    const a = await client
      .searchServiceJiraIssue({ serviceId: "test1" as ServiceId })
      .run();
    expect(a.isRight()).toBeTruthy();
    // tslint:disable-next-line: no-null-keyword no-console
    console.log(JSON.stringify(a.value, null, 4));
  });
});

describe("JiraAPIClient#getServiceJiraIssuesByStatus", () => {
  it("should success with right parameters", async () => {
    const client = JiraAPIClient(
      "https://pagopa.atlassian.net",
      "daniele.manni@pagopa.it",
      "token",
      "DMT"
    );
    const a = await client
      .getServiceJiraIssuesByStatus({
        serviceId: "test1" as ServiceId,
        status: "NEW" as NonEmptyString
      })
      .run();
    expect(a.isRight()).toBeTruthy();
    // tslint:disable-next-line: no-null-keyword no-console
    console.log(JSON.stringify(a.value, null, 4));
  });
});
