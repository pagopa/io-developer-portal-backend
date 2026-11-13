import { brotliDecoders } from "../../__test_helpers__/brotli-decoder";
import { spawnSync } from "child_process";
import { EventEmitter } from "events";
import { ServerResponse } from "http";
import nodeFetch from "node-fetch";
import { Transform } from "stream";
import { promisify } from "util";
import * as zlib from "zlib";
import {
  waitForEvent,
  withLocalHttpServer
} from "../../__test_helpers__/local-http-server";
import { createUncompressedFetch } from "../uncompressed-fetch";

const json = JSON.stringify({ ok: true });
const brotliBody = zlib.brotliCompressSync(json);
const gzipBody = zlib.gzipSync(json);
const deflateBody = zlib.deflateSync(json);
const unsupportedEncoding = "Unsupported Content-Encoding";

const brotliEncodingCases: ReadonlyArray<{
  readonly encoding: string | undefined;
  readonly name: string;
  readonly shouldReject: boolean;
}> = [
  { encoding: undefined, name: "missing", shouldReject: false },
  { encoding: "br", name: "br", shouldReject: true },
  { encoding: "gzip", name: "incorrect gzip", shouldReject: true },
  { encoding: "identity", name: "misleading identity", shouldReject: false },
  { encoding: "", name: "empty", shouldReject: true },
  { encoding: "invalid token", name: "malformed", shouldReject: true }
];
const brotliResponseCases = [
  undefined,
  "application/json",
  "application/brotli",
  "text/plain",
  "br"
]
  .map(contentType =>
    brotliEncodingCases.map(({ encoding, name, shouldReject }) => ({
      contentType,
      encoding,
      name: `${name} Content-Encoding and ${contentType ||
        "missing"} Content-Type`,
      shouldReject
    }))
  )
  .reduce((cases, nextCases) => cases.concat(nextCases));

const respondWithBrotli = (
  response: ServerResponse,
  encoding: string | undefined,
  contentType: string | undefined
): void => {
  response.writeHead(200, {
    ...(encoding !== undefined ? { "Content-Encoding": encoding } : {}),
    ...(contentType !== undefined ? { "Content-Type": contentType } : {})
  });
  response.end(brotliBody);
};

const expectBrotliBodyNotDecoded = async (
  fetchApi: typeof fetch,
  url: string,
  shouldReject: boolean
): Promise<void> => {
  const caller = new AbortController();
  const timeout = setTimeout(() => caller.abort(), 2000);
  try {
    const pending = fetchApi(url, { signal: caller.signal });
    if (shouldReject) {
      await expect(pending).rejects.toThrow(unsupportedEncoding);
    } else {
      const response = await pending;
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(brotliBody);
    }
  } finally {
    clearTimeout(timeout);
  }
};

beforeEach(() => {
  brotliDecoders.forEach(({ decoder }) => decoder.mockClear());
});

afterEach(() => {
  brotliDecoders.forEach(({ decoder }) => {
    expect(decoder).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  brotliDecoders.forEach(({ restore }) => restore());
});

describe("createUncompressedFetch", () => {
  it("prevents the decoder reached by the node-fetch default", async () => {
    const observedEncodings = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observedEncodings(request.headers["accept-encoding"]);
        response.writeHead(200, {
          "Content-Encoding": "br",
          "Content-Type": "application/json"
        });
        response.end(brotliBody);
      },
      async baseUrl => {
        const baseline = await nodeFetch(baseUrl);
        expect(await baseline.json()).toEqual({ ok: true });
        brotliDecoders.forEach(({ decoder, name }) => {
          expect(decoder).toHaveBeenCalledTimes(
            name === "createBrotliDecompress" ? 1 : 0
          );
        });
        brotliDecoders.forEach(({ decoder }) => decoder.mockClear());

        const options: RequestInit & { readonly compress: boolean } = {
          compress: true,
          headers: { "Accept-Encoding": "br" }
        };
        await expect(
          createUncompressedFetch()(baseUrl, options)
        ).rejects.toThrow(unsupportedEncoding);
        expect(observedEncodings.mock.calls).toEqual([
          ["gzip,deflate"],
          ["identity"]
        ]);
      }
    );
  });

  it.each([
    {
      name: "BrotliDecompress",
      run: () => {
        // The installed Node typings omit the public BrotliDecompress constructor.
        const constructor: unknown = Reflect.get(zlib, "BrotliDecompress");
        if (typeof constructor !== "function") {
          throw new Error("BrotliDecompress constructor is not available");
        }
        const decoder: unknown = Reflect.construct(constructor, []);
        if (!(decoder instanceof Transform)) {
          throw new Error("BrotliDecompress did not create a Transform");
        }
        expect(decoder).toBeInstanceOf(constructor);
        const response = new nodeFetch.Response(decoder);
        decoder.end(brotliBody);
        return response.buffer();
      }
    },
    {
      name: "brotliDecompress",
      run: () => promisify(zlib.brotliDecompress)(brotliBody)
    },
    {
      name: "brotliDecompressSync",
      run: () => zlib.brotliDecompressSync(brotliBody)
    }
  ])(
    "observes the $name entrypoint without changing decoding",
    async ({ name, run }) => {
      expect(await run()).toEqual(Buffer.from(json));
      brotliDecoders.forEach(({ decoder, name: entrypoint }) => {
        expect(decoder).toHaveBeenCalledTimes(entrypoint === name ? 1 : 0);
      });
      brotliDecoders.forEach(({ decoder }) => decoder.mockClear());
    }
  );

  it.each([
    { description: "no Content-Encoding", encoding: undefined },
    { description: "identity", encoding: "identity" },
    { description: "case-insensitive identity", encoding: "IDENTITY" }
  ])("accepts JSON with $description", async ({ encoding }) => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(request.headers["accept-encoding"]);
        if (encoding) {
          response.setHeader("Content-Encoding", encoding);
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(json);
      },
      async baseUrl => {
        const response = await createUncompressedFetch()(baseUrl);
        expect(await response.json()).toEqual({ ok: true });
        expect(observed).toHaveBeenCalledWith("identity");
      }
    );
  });

  it("leaves a Brotli body undecoded when Content-Encoding is absent", async () => {
    await withLocalHttpServer(
      (_request, response) =>
        respondWithBrotli(response, undefined, "application/json"),
      async baseUrl => {
        const response = await createUncompressedFetch()(baseUrl);
        expect(response.headers.has("Content-Encoding")).toBe(false);
        expect(Buffer.from(await response.clone().arrayBuffer())).toEqual(
          brotliBody
        );
        await expect(response.json()).rejects.toMatchObject({
          type: "invalid-json"
        });
      }
    );
  });

  it.each(brotliResponseCases)(
    "does not decode a Brotli body with $name",
    async ({ contentType, encoding, shouldReject }) => {
      const observed = jest.fn();
      await withLocalHttpServer(
        (request, response) => {
          observed(request.headers["accept-encoding"]);
          respondWithBrotli(response, encoding, contentType);
        },
        async baseUrl => {
          await expectBrotliBodyNotDecoded(
            createUncompressedFetch(),
            baseUrl,
            shouldReject
          );
          expect(observed.mock.calls).toEqual([["identity"]]);
        }
      );
    }
  );

  it("never invokes the Brotli decoder under concurrent real HTTP load", async () => {
    const repetitions = 10;
    const concurrency = brotliResponseCases.length;
    const observed = jest.fn();
    const observedConcurrency = jest.fn();
    const pendingResponses = new Map<
      ServerResponse,
      typeof brotliResponseCases[number]
    >();
    const fetchApi = createUncompressedFetch();

    await withLocalHttpServer(
      (request, response) => {
        observed(request.url, request.headers["accept-encoding"]);
        const responseCase = brotliResponseCases.find(
          (_testCase, index) => request.url === `/${index}`
        );
        if (!responseCase) {
          response.writeHead(500);
          response.end("Unexpected load-test URL");
          return;
        }
        pendingResponses.set(response, responseCase);
        // Hold every response until the entire batch has reached the server.
        if (pendingResponses.size === concurrency) {
          observedConcurrency(pendingResponses.size);
          pendingResponses.forEach(({ encoding, contentType }, pending) =>
            respondWithBrotli(pending, encoding, contentType)
          );
          pendingResponses.clear();
        }
      },
      async baseUrl => {
        await Array.from({ length: repetitions }).reduce(async previous => {
          await previous;
          const results = await Promise.all(
            brotliResponseCases.map(({ shouldReject }, index) =>
              expectBrotliBodyNotDecoded(
                fetchApi,
                `${baseUrl}/${index}`,
                shouldReject
              ).then(
                () => ({ status: "fulfilled" }),
                (reason: unknown) => ({ reason, status: "rejected" })
              )
            )
          );
          expect(results).toEqual(
            brotliResponseCases.map(() => ({
              status: "fulfilled"
            }))
          );
        }, Promise.resolve());
        expect(observed).toHaveBeenCalledTimes(repetitions * concurrency);
        brotliResponseCases.forEach((_testCase, index) => {
          expect(
            observed.mock.calls.filter(
              ([url, encoding]) =>
                url === `/${index}` && encoding === "identity"
            )
          ).toHaveLength(repetitions);
        });
        expect(observedConcurrency.mock.calls).toEqual(
          Array.from({ length: repetitions }, () => [concurrency])
        );
        expect(pendingResponses.size).toBe(0);
        brotliDecoders.forEach(({ decoder }) => {
          expect(decoder).not.toHaveBeenCalled();
        });
      }
    );
  }, 15000);

  it("works with native fetch globals disabled", () => {
    const script = `
      const http = require("http");
      const zlib = require("zlib");
      const decoderCalls = [];
      [
        "createBrotliDecompress",
        "BrotliDecompress",
        "brotliDecompress",
        "brotliDecompressSync"
      ].forEach(name => {
        const descriptor = Object.getOwnPropertyDescriptor(zlib, name);
        if (!descriptor || typeof descriptor.value !== "function") {
          throw new Error("Brotli decoder is not available: " + name);
        }
        Object.defineProperty(zlib, name, {
          ...descriptor,
          value: new Proxy(descriptor.value, {
            apply(target, thisArg, args) {
              decoderCalls.push(name);
              return Reflect.apply(target, thisArg, args);
            },
            construct(target, args, newTarget) {
              decoderCalls.push(name);
              return Reflect.construct(target, args, newTarget);
            }
          })
        });
      });
      const { createUncompressedFetch } = require("./src/utils/uncompressed-fetch");
      if (typeof globalThis.Headers !== "undefined") {
        throw new Error("Native Headers was not disabled");
      }
      const server = http.createServer((request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ encoding: request.headers["accept-encoding"] }));
      });
      server.listen(0, "127.0.0.1", async () => {
        try {
          const response = await createUncompressedFetch()(
            "http://127.0.0.1:" + server.address().port
          );
          const body = await response.json();
          if (body.encoding !== "identity") {
            throw new Error("Unexpected Accept-Encoding");
          }
          if (decoderCalls.length !== 0) {
            throw new Error("Unexpected Brotli decoding: " + decoderCalls.join(", "));
          }
          console.log("identity");
        } catch (error) {
          console.error(error);
          process.exitCode = 1;
        } finally {
          server.close();
        }
      });
    `;
    const result = spawnSync(
      process.execPath,
      [
        "--no-experimental-fetch",
        "--no-warnings",
        "-r",
        "ts-node/register/transpile-only",
        "-e",
        script
      ],
      { encoding: "utf8", timeout: 10000 }
    );
    expect({ status: result.status, stderr: result.stderr }).toEqual({
      status: 0,
      stderr: ""
    });
    expect(result.stdout.trim()).toBe("identity");
  });

  it.each([
    { body: brotliBody, encoding: "br", name: "Brotli", status: 200 },
    { body: gzipBody, encoding: "gzip", name: "gzip", status: 200 },
    { body: gzipBody, encoding: "x-gzip", name: "x-gzip", status: 200 },
    { body: deflateBody, encoding: "deflate", name: "deflate", status: 200 },
    { body: json, encoding: "zstd", name: "unknown", status: 200 },
    { body: json, encoding: "", name: "empty", status: 200 },
    { body: json, encoding: "invalid token", name: "malformed", status: 200 },
    { body: json, encoding: "identity, br", name: "multiple", status: 200 },
    {
      body: json,
      encoding: "identity, identity",
      name: "multiple identity tokens",
      status: 200
    },
    { body: json, encoding: "br", name: "mislabeled JSON", status: 200 },
    { body: brotliBody, encoding: "br", name: "created", status: 201 },
    { body: brotliBody, encoding: "br", name: "not found", status: 404 },
    { body: gzipBody, encoding: "gzip", name: "server error", status: 500 },
    { body: brotliBody, encoding: "br", name: "no content", status: 204 },
    {
      body: deflateBody,
      encoding: "deflate",
      name: "not modified",
      status: 304
    }
  ])(
    "rejects $name encoding on status $status before a consumer reads it",
    async ({ body, encoding, status }) => {
      await withLocalHttpServer(
        (_request, response) => {
          response.writeHead(status, { "Content-Encoding": encoding });
          response.end(body);
        },
        async baseUrl => {
          await expect(createUncompressedFetch()(baseUrl)).rejects.toThrow(
            unsupportedEncoding
          );
        }
      );
    }
  );

  it("rejects repeated Content-Encoding headers", async () => {
    await withLocalHttpServer(
      (_request, response) => {
        response.setHeader("Content-Encoding", ["identity", "br"]);
        response.writeHead(200);
        response.end(json);
      },
      async baseUrl => {
        await expect(createUncompressedFetch()(baseUrl)).rejects.toThrow(
          unsupportedEncoding
        );
      }
    );
  });

  it("rejects encoded HEAD responses even without a body", async () => {
    await withLocalHttpServer(
      (_request, response) => {
        response.writeHead(200, { "Content-Encoding": "br" });
        response.end();
      },
      async baseUrl => {
        await expect(
          createUncompressedFetch()(baseUrl, { method: "HEAD" })
        ).rejects.toThrow(unsupportedEncoding);
      }
    );
  });

  it("keeps compression disabled across followed redirects", async () => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(request.url, request.headers["accept-encoding"]);
        if (request.url === "/start") {
          response.writeHead(302, {
            "Content-Encoding": "br",
            Location: "/target"
          });
        } else {
          response.writeHead(200, { "Content-Encoding": "br" });
        }
        response.end(brotliBody);
      },
      async baseUrl => {
        await expect(
          createUncompressedFetch()(`${baseUrl}/start`)
        ).rejects.toThrow(unsupportedEncoding);
        expect(observed.mock.calls).toEqual([
          ["/start", "identity"],
          ["/target", "identity"]
        ]);
      }
    );
  });

  it("keeps compression disabled across a cross-origin redirect", async () => {
    const observed = jest.fn();
    await withLocalHttpServer(
      (request, response) => {
        observed(request.headers["accept-encoding"]);
        response.writeHead(200, { "Content-Encoding": "br" });
        response.end(brotliBody);
      },
      async targetUrl => {
        await withLocalHttpServer(
          (_request, response) => {
            response.writeHead(302, { Location: `${targetUrl}/target` });
            response.end();
          },
          async sourceUrl => {
            await expect(createUncompressedFetch()(sourceUrl)).rejects.toThrow(
              unsupportedEncoding
            );
            expect(observed).toHaveBeenCalledWith("identity");
          }
        );
      }
    );
  });

  it("overrides caller compression and encoding without losing request options", async () => {
    const injectedFetch = jest.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit
      ): Promise<Response> => new Response(json, { status: 200 })
    );
    const options: RequestInit & { readonly compress: boolean } = {
      body: "payload",
      compress: true,
      headers: {
        "Accept-Encoding": "br",
        "Content-Type": "text/plain",
        "X-Test": "value"
      },
      method: "POST",
      redirect: "manual"
    };

    const response = await createUncompressedFetch(injectedFetch)(
      "https://example.invalid",
      options
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(injectedFetch).toHaveBeenCalledWith(
      "https://example.invalid",
      expect.objectContaining({
        body: "payload",
        compress: false,
        method: "POST",
        redirect: "manual"
      })
    );
    const requestOptions = injectedFetch.mock.calls[0][1];
    if (!requestOptions) {
      throw new Error("Expected request options");
    }
    const headers = new Headers(requestOptions.headers);
    expect(headers.get("Accept-Encoding")).toBe("identity");
    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("X-Test")).toBe("value");
  });

  it("inherits headers and cancellation from a Request input", async () => {
    const caller = new AbortController();
    const injectedFetch = jest.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit
      ): Promise<Response> => new Response(undefined, { status: 204 })
    );
    const request = new Request("https://example.invalid", {
      headers: { "Accept-Encoding": "gzip", "X-Test": "request-header" },
      signal: caller.signal
    });
    const removeListener = jest.spyOn(request.signal, "removeEventListener");

    await createUncompressedFetch(injectedFetch)(request);
    const options = injectedFetch.mock.calls[0][1];
    if (!options) {
      throw new Error("Expected request options");
    }
    const headers = new Headers(options.headers);
    expect(headers.get("Accept-Encoding")).toBe("identity");
    expect(headers.get("X-Test")).toBe("request-header");
    expect(options.signal).toBeDefined();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    removeListener.mockRestore();
  });

  it("closes a streaming compressed response when it is rejected", async () => {
    const closed = new EventEmitter();
    const waitForClose = waitForEvent(closed, "closed");
    const caller = new AbortController();
    const removeListener = jest.spyOn(caller.signal, "removeEventListener");
    await withLocalHttpServer(
      (_request, response) => {
        response.once("close", () => closed.emit("closed"));
        response.writeHead(200, { "Content-Encoding": "gzip" });
        response.write(gzipBody.subarray(0, 5));
      },
      async baseUrl => {
        await expect(
          createUncompressedFetch()(baseUrl, { signal: caller.signal })
        ).rejects.toThrow(unsupportedEncoding);
        await waitForClose;
        expect(caller.signal.aborted).toBe(false);
        expect(removeListener).toHaveBeenCalledWith(
          "abort",
          expect.any(Function)
        );
      }
    );
    removeListener.mockRestore();
  });

  it("honors cancellation before response headers arrive", async () => {
    const started = new EventEmitter();
    const waitForRequest = waitForEvent(started, "request");
    const caller = new AbortController();
    const removeListener = jest.spyOn(caller.signal, "removeEventListener");
    await withLocalHttpServer(
      () => {
        started.emit("request");
      },
      async baseUrl => {
        const pending = createUncompressedFetch()(baseUrl, {
          signal: caller.signal
        });
        const rejection = expect(pending).rejects.toMatchObject({
          name: "AbortError"
        });
        await waitForRequest;
        caller.abort();
        await rejection;
        expect(removeListener).toHaveBeenCalledWith(
          "abort",
          expect.any(Function)
        );
      }
    );
    removeListener.mockRestore();
  });

  it("does not send a request when the caller signal is already aborted", async () => {
    const observed = jest.fn();
    const caller = new AbortController();
    caller.abort();
    await withLocalHttpServer(observed, async baseUrl => {
      await expect(
        createUncompressedFetch()(baseUrl, { signal: caller.signal })
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(observed).not.toHaveBeenCalled();
    });
  });

  it("honors cancellation while a response body is being consumed", async () => {
    const closed = new EventEmitter();
    const waitForClose = waitForEvent(closed, "closed");
    const caller = new AbortController();
    await withLocalHttpServer(
      (_request, response) => {
        response.once("close", () => closed.emit("closed"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.write('{"ok":');
      },
      async baseUrl => {
        const response = await createUncompressedFetch()(baseUrl, {
          signal: caller.signal
        });
        const rejection = expect(response.json()).rejects.toMatchObject({
          name: "AbortError"
        });
        caller.abort();
        await rejection;
        await waitForClose;
      }
    );
  });

  it("releases the caller's abort listener after a completed response", async () => {
    const caller = new AbortController();
    const addListener = jest.spyOn(caller.signal, "addEventListener");
    const removeListener = jest.spyOn(caller.signal, "removeEventListener");
    await withLocalHttpServer(
      (_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(json);
      },
      async baseUrl => {
        const response = await createUncompressedFetch()(baseUrl, {
          signal: caller.signal
        });
        expect(await response.json()).toEqual({ ok: true });
        expect(addListener).toHaveBeenCalledWith(
          "abort",
          expect.any(Function),
          { once: true }
        );
        expect(removeListener).toHaveBeenCalledWith(
          "abort",
          expect.any(Function)
        );
      }
    );
    addListener.mockRestore();
    removeListener.mockRestore();
  });

  it("releases the abort listener when an unread response finishes", async () => {
    const caller = new AbortController();
    const detached = new EventEmitter();
    const originalRemove = caller.signal.removeEventListener.bind(
      caller.signal
    );
    const removeListener = jest
      .spyOn(caller.signal, "removeEventListener")
      .mockImplementation((type, listener, options) => {
        originalRemove(type, listener, options);
        detached.emit("detached");
      });
    const waitForDetach = waitForEvent(detached, "detached");
    await withLocalHttpServer(
      (_request, response) => {
        response.writeHead(404);
        response.end("not found");
      },
      async baseUrl => {
        const response = await createUncompressedFetch()(baseUrl, {
          signal: caller.signal
        });
        expect(response.status).toBe(404);
        await waitForDetach;
      }
    );
    removeListener.mockRestore();
  });
});
