import { brotliDecoders } from "../__test_helpers__/brotli-decoder";
import { EmailString as CmsEmailString } from "@pagopa/ts-commons/lib/strings";
import {
  response as expressResponse,
  Response as ExpressResponse
} from "express";
import { ServerResponse } from "http";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";
import * as zlib from "zlib";
import { DevelopmentProfile } from "../../generated/api/DevelopmentProfile";
import { EmailAddress } from "../../generated/api/EmailAddress";
import { FiscalCode } from "../../generated/api/FiscalCode";
import { Logo } from "../../generated/api/Logo";
import { NewMessage } from "../../generated/api/NewMessage";
import { Service } from "../../generated/api/Service";
import { ServiceId } from "../../generated/api/ServiceId";
import { withLocalHttpServer } from "../__test_helpers__/local-http-server";
import { APIClient } from "../api_client";
import { getCmsRestClient } from "../cms_api_client";
import * as config from "../config";
import { serviceDataTask } from "../controllers/service_data";
import { IJiraConfig, JiraAPIClient } from "../jira_client";

jest.mock("../logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn() }
}));

const unsupportedEncoding = "Unsupported Content-Encoding";
const serviceId = "service-1" as ServiceId;
const organizationId = "12345678901" as OrganizationFiscalCode;
const jiraConfig: IJiraConfig = {
  boardId: "BOARD" as NonEmptyString,
  delegateIdField: "delegate" as NonEmptyString,
  emailIdField: "email" as NonEmptyString,
  jiraEmail: "bot@example.invalid" as EmailAddress,
  organizationIdField: "organization" as NonEmptyString,
  statusComplete: "Complete" as NonEmptyString,
  token: "test-token" as NonEmptyString
};
const cmsFields = {
  subscriptionId: "test-subscription" as NonEmptyString,
  userEmail: "user@example.invalid" as CmsEmailString,
  userGroups: ["test-group" as NonEmptyString],
  userId: "test-user" as NonEmptyString
};

const respond = (
  response: ServerResponse,
  status: number,
  body: object,
  encoding?: "br" | "gzip"
): void => {
  response.writeHead(status, {
    ...(encoding ? { "Content-Encoding": encoding } : {}),
    "Content-Type": "application/json"
  });
  const payload = JSON.stringify(body);
  response.end(
    encoding === "br"
      ? zlib.brotliCompressSync(payload)
      : encoding === "gzip"
      ? zlib.gzipSync(payload)
      : payload
  );
};

beforeEach(() => {
  brotliDecoders.forEach(({ decoder }) => decoder.mockClear());
});

afterEach(() => {
  brotliDecoders.forEach(({ decoder }) => {
    expect(decoder).not.toHaveBeenCalled();
  });
  jest.restoreAllMocks();
});

afterAll(() => {
  brotliDecoders.forEach(({ restore }) => restore());
});

describe("IO/Admin API client", () => {
  it("preserves uncompressed JSON and the subscription header", async () => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(
          request.method,
          request.url,
          request.headers["accept-encoding"],
          request.headers["ocp-apim-subscription-key"]
        );
        respond(response, 200, { cidrs: [], id: "subscription-1" });
      },
      async baseUrl => {
        const result = await APIClient(
          baseUrl,
          "test-subscription-key"
        ).getSubscriptionCidrs({
          subscriptionId: "subscription-1" as NonEmptyString
        });
        expect(result).toMatchObject({
          status: 200,
          value: { cidrs: [], id: "subscription-1" }
        });
        expect(observed).toHaveBeenCalledWith(
          "GET",
          "/adm/subscriptions/subscription-1/cidrs",
          "identity",
          "test-subscription-key"
        );
      }
    );
  });

  it("preserves normal 404 handling while rejecting a compressed 404", async () => {
    await withLocalHttpServer(
      (request, response) => {
        respond(
          response,
          404,
          { error: "not found" },
          request.url && request.url.includes("compressed") ? "br" : undefined
        );
      },
      async baseUrl => {
        const client = APIClient(baseUrl, "test-key");
        const plain = await client.getSubscriptionCidrs({
          subscriptionId: "plain" as NonEmptyString
        });
        expect(plain).toMatchObject({ status: 404 });
        await expect(
          client.getSubscriptionCidrs({
            subscriptionId: "compressed" as NonEmptyString
          })
        ).rejects.toThrow(unsupportedEncoding);
      }
    );
  });

  it("rejects a compressed successful response before JSON decoding", async () => {
    await withLocalHttpServer(
      (_request, response) =>
        respond(response, 200, { cidrs: [], id: "subscription-1" }, "br"),
      async baseUrl => {
        await expect(
          APIClient(baseUrl, "test-key").getSubscriptionCidrs({
            subscriptionId: "subscription-1" as NonEmptyString
          })
        ).rejects.toThrow(unsupportedEncoding);
      }
    );
  });

  it("reports an encoded write response even if the server processed the PUT", async () => {
    const processed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        request.resume();
        request.once("end", () => {
          processed(request.method, request.url);
          respond(response, 200, { cidrs: [], id: "subscription-1" }, "gzip");
        });
      },
      async baseUrl => {
        await expect(
          APIClient(baseUrl, "test-key").updateSubscriptionCidrs({
            cidrs: [],
            subscriptionId: "subscription-1" as NonEmptyString
          })
        ).rejects.toThrow(unsupportedEncoding);
        expect(processed).toHaveBeenCalledWith(
          "PUT",
          "/adm/subscriptions/subscription-1/cidrs"
        );
      }
    );
  });

  it("applies the guarded injected fetch to all nine operations", async () => {
    const injectedFetch = jest.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit
      ): Promise<Response> => new Response(undefined, { status: 404 })
    );
    const client = APIClient(
      "https://example.invalid",
      "test-key",
      injectedFetch
    );
    const fiscalCode = "AAAAAA00A00A000A" as FiscalCode;
    await Promise.all([
      client.getService({ id: "service-1" }),
      client.sendMessage({ fiscalCode, message: {} as NewMessage }),
      client.createDevelopmentProfile({
        fiscalCode,
        newProfile: {} as DevelopmentProfile
      }),
      client.createService({ service: {} as Service }),
      client.updateService({ service: {} as Service, serviceId: "service-1" }),
      client.uploadServiceLogo({ logo: {} as Logo, serviceId: "service-1" }),
      client.uploadOrganizationLogo({
        logo: {} as Logo,
        organizationfiscalcode: "12345678901"
      }),
      client.getSubscriptionCidrs({
        subscriptionId: "subscription-1" as NonEmptyString
      }),
      client.updateSubscriptionCidrs({
        cidrs: [],
        subscriptionId: "subscription-1" as NonEmptyString
      })
    ]);

    expect(injectedFetch).toHaveBeenCalledTimes(9);
    injectedFetch.mock.calls.forEach(([, options]) => {
      expect(options).toEqual(expect.objectContaining({ compress: false }));
      const headers = new Headers(options && options.headers);
      expect(headers.get("Accept-Encoding")).toBe("identity");
      expect(headers.get("Ocp-Apim-Subscription-Key")).toBe("test-key");
    });
  });
});

describe("CMS client", () => {
  it("preserves the uncompressed lifecycle result and application headers", async () => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(
          request.headers["accept-encoding"],
          request.headers["x-subscription-id"],
          request.headers["x-user-id"]
        );
        respond(response, 200, { status: { value: "approved" } });
      },
      async baseUrl => {
        const result = await getCmsRestClient(
          baseUrl as NonEmptyString
        ).getServiceLifecycle(serviceId, cmsFields);
        expect(result.isSome()).toBe(true);
        if (result.isSome()) {
          expect(result.value).toEqual({ status: { value: "approved" } });
        }
        expect(observed).toHaveBeenCalledWith(
          "identity",
          "test-subscription",
          "test-user"
        );
      }
    );
  });

  it("returns None for a plain 404 but rejects a compressed 404", async () => {
    await withLocalHttpServer(
      (request, response) => {
        respond(
          response,
          404,
          { error: "not found" },
          request.url && request.url.includes("compressed") ? "br" : undefined
        );
      },
      async baseUrl => {
        const client = getCmsRestClient(baseUrl as NonEmptyString);
        const plain = await client.checkServiceDuplication(
          organizationId,
          "plain" as NonEmptyString
        );
        expect(plain.isNone()).toBe(true);
        await expect(
          client.checkServiceDuplication(
            organizationId,
            "compressed" as NonEmptyString
          )
        ).rejects.toThrow(unsupportedEncoding);
      }
    );
  });

  it("rejects a compressed lifecycle response before validation", async () => {
    await withLocalHttpServer(
      (_request, response) =>
        respond(response, 200, { status: { value: "approved" } }, "br"),
      async baseUrl => {
        await expect(
          getCmsRestClient(baseUrl as NonEmptyString).getServiceLifecycle(
            serviceId,
            cmsFields
          )
        ).rejects.toThrow(unsupportedEncoding);
      }
    );
  });

  it("rejects a compressed error before the publication response is read", async () => {
    await withLocalHttpServer(
      (_request, response) =>
        respond(response, 500, { error: "failure" }, "gzip"),
      async baseUrl => {
        await expect(
          getCmsRestClient(baseUrl as NonEmptyString).getServicePublication(
            serviceId,
            cmsFields
          )
        ).rejects.toThrow(unsupportedEncoding);
      }
    );
  });
});

describe("Jira client", () => {
  it("preserves an uncompressed search and authentication", async () => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(
          request.method,
          request.url,
          request.headers["accept-encoding"],
          request.headers.authorization
        );
        respond(response, 200, { issues: [] });
      },
      async baseUrl => {
        const result = await JiraAPIClient(
          baseUrl as NonEmptyString,
          jiraConfig
        )
          .searchServiceJiraIssue({ serviceId })
          .run();
        expect(result.isRight()).toBe(true);
        expect(result.value).toEqual({ issues: [] });
        expect(observed).toHaveBeenCalledWith(
          "POST",
          "/rest/api/3/search/jql",
          "identity",
          expect.stringMatching(/^Basic /)
        );
      }
    );
  });

  it("propagates a compressed create response as an error", async () => {
    await withLocalHttpServer(
      (_request, response) =>
        respond(response, 201, { id: "1", key: "BOARD-1" }, "br"),
      async baseUrl => {
        const result = await JiraAPIClient(
          baseUrl as NonEmptyString,
          jiraConfig
        )
          .createJiraIssue(
            "title" as NonEmptyString,
            "description" as NonEmptyString,
            {
              delegateName: "test delegate" as NonEmptyString,
              email: "delegate@example.invalid" as EmailString,
              organizationName: "test organization" as NonEmptyString,
              serviceId
            }
          )
          .run();
        expect(result.isLeft()).toBe(true);
        expect(result.value).toHaveProperty(
          "message",
          expect.stringContaining(unsupportedEncoding)
        );
      }
    );
  });

  it("does not turn a compressed 204 response into success", async () => {
    await withLocalHttpServer(
      (request, response) =>
        respond(
          response,
          204,
          {},
          request.url && request.url.includes("compressed") ? "br" : undefined
        ),
      async baseUrl => {
        const client = JiraAPIClient(baseUrl as NonEmptyString, jiraConfig);
        const plain = await client
          .deleteJiraIssue("plain" as NonEmptyString)
          .run();
        expect(plain.isRight()).toBe(true);
        expect(plain.value).toBe("OK");

        const compressed = await client
          .deleteJiraIssue("compressed" as NonEmptyString)
          .run();
        expect(compressed.isLeft()).toBe(true);
        expect(compressed.value).toHaveProperty(
          "message",
          expect.stringContaining(unsupportedEncoding)
        );
      }
    );
  });

  it("applies the guarded injected fetch to all six operations", async () => {
    const injectedFetch = jest.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit
      ): Promise<Response> => new Response(undefined, { status: 400 })
    );
    const client = JiraAPIClient(
      "https://example.invalid" as NonEmptyString,
      jiraConfig,
      injectedFetch
    );
    const issueId = "BOARD-1" as NonEmptyString;
    const results = await Promise.all([
      client
        .getServiceJiraIssuesByStatus({
          serviceId,
          status: "new" as NonEmptyString
        })
        .run(),
      client.searchServiceJiraIssue({ serviceId }).run(),
      client
        .createJiraIssue(
          "title" as NonEmptyString,
          "description" as NonEmptyString,
          {
            delegateName: "test delegate" as NonEmptyString,
            email: "delegate@example.invalid" as EmailString,
            organizationName: "test organization" as NonEmptyString,
            serviceId
          }
        )
        .run(),
      client.createJiraIssueComment(issueId, "comment" as NonEmptyString).run(),
      client.deleteJiraIssue(issueId).run(),
      client.applyJiraIssueTransition(issueId, "1" as NonEmptyString).run()
    ]);

    expect(results.every(result => result.isLeft())).toBe(true);
    expect(injectedFetch).toHaveBeenCalledTimes(6);
    injectedFetch.mock.calls.forEach(([, options]) => {
      expect(options).toEqual(expect.objectContaining({ compress: false }));
      const headers = new Headers(options && options.headers);
      expect(headers.get("Accept-Encoding")).toBe("identity");
      expect(headers.get("Authorization")).toMatch(/^Basic /);
    });
  });
});

describe("conditional service data fetch", () => {
  it("preserves uncompressed JSON and the function key", async () => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(
          request.url,
          request.headers["accept-encoding"],
          request.headers["x-functions-key"]
        );
        respond(response, 200, { items: [] });
      },
      async baseUrl => {
        jest.replaceProperty(config, "SERVICE_DATA_URL", baseUrl);
        jest.replaceProperty(
          config,
          "SERVICE_DATA_APIKEY",
          "test-functions-key"
        );
        const result = await serviceDataTask(organizationId).run();
        expect(result.isRight()).toBe(true);
        if (result.isRight()) {
          expect(result.value.value).toEqual({ items: [] });
        }
        expect(observed).toHaveBeenCalledWith(
          "/organizations/12345678901/services",
          "identity",
          "test-functions-key"
        );
      }
    );
  });

  it("returns an explicit internal error for an encoded downstream response", async () => {
    await withLocalHttpServer(
      (_request, response) => respond(response, 200, { items: [] }, "br"),
      async baseUrl => {
        jest.replaceProperty(config, "SERVICE_DATA_URL", baseUrl);
        const result = await serviceDataTask(organizationId).run();
        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) {
          expect(result.value.kind).toBe("IResponseErrorInternal");
          const response: ExpressResponse = Object.create(expressResponse);
          const json = jest.spyOn(response, "json").mockReturnThis();
          jest.spyOn(response, "set").mockReturnThis();
          jest.spyOn(response, "status").mockReturnThis();
          result.value.apply(response);
          expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
              detail: expect.stringContaining(unsupportedEncoding),
              status: 500
            })
          );
        }
      }
    );
  });

  it("passes the mitigation options to an injected fetch", async () => {
    const injectedFetch = jest.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit
      ): Promise<Response> =>
        new Response(JSON.stringify({ items: [] }), { status: 200 })
    );
    const result = await serviceDataTask(organizationId, injectedFetch).run();
    expect(result.isRight()).toBe(true);
    const options = injectedFetch.mock.calls[0][1];
    expect(options).toEqual(expect.objectContaining({ compress: false }));
    expect(new Headers(options && options.headers).get("Accept-Encoding")).toBe(
      "identity"
    );
  });
});
