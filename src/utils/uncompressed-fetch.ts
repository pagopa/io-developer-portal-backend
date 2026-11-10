import nodeFetch from "node-fetch";
import { PassThrough, Readable } from "stream";
import { logger } from "../logger";

/**
 * Detaches the caller's abort listener when a Node response body completes.
 * Also handles streams that finished or were destroyed before registration.
 */
const releaseOnBodyCompletion = (body: Readable, release: () => void): void => {
  const onCompletion = (): void => {
    body.removeListener("end", onCompletion);
    body.removeListener("finish", onCompletion);
    body.removeListener("close", onCompletion);
    body.removeListener("error", onError);
    release();
  };
  // Avoid hiding errors when no other listener is available to report them.
  const onError = (error: Error): void => {
    const hasOtherErrorListeners = body.listenerCount("error") > 0;
    onCompletion();
    if (!hasOtherErrorListeners && error.name !== "AbortError") {
      logger.error("Downstream response stream failed: %s", error.message);
    }
  };

  body.once("end", onCompletion);
  body.once("finish", onCompletion);
  body.once("close", onCompletion);
  body.once("error", onError);
  // A PassThrough can finish writing before its readable side is consumed.
  if (
    body.destroyed ||
    (body instanceof PassThrough && body.writableFinished)
  ) {
    onCompletion();
  }
};

/**
 * Aborts a response with an unsupported content encoding and destroys its
 * Node body, while handling errors emitted during cleanup.
 */
const abortUnsupportedResponse = (
  body: unknown,
  controller: AbortController
): void => {
  if (body instanceof Readable) {
    const onError = (error: Error): void => {
      if (error.name !== "AbortError") {
        logger.error("Error aborting downstream response: %s", error.message);
      }
    };
    body.once("error", onError);
    body.once("close", () => body.removeListener("error", onError));
  }

  controller.abort();
  if (body instanceof Readable) {
    body.destroy();
  }
};

// node-fetch's Request and Response declarations differ from the DOM fetch types.
/**
 * Creates a fetch wrapper that requests identity encoding and passes
 * `compress: false` to disable node-fetch decompression. Responses with
 * another content encoding are aborted and rejected.
 *
 * Caller cancellation is forwarded until the Node response body completes.
 * @param fetchApi Fetch implementation to wrap; defaults to node-fetch.
 * @returns A fetch-compatible function that rejects non-identity encodings.
 */
export const createUncompressedFetch = (
  // tslint:disable-next-line:no-any
  fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch
): typeof fetch => async (input, init) => {
  const inputHeaders =
    typeof input !== "string" && "headers" in input ? input.headers : undefined;
  const inputSignal =
    typeof input !== "string" && "signal" in input ? input.signal : undefined;
  // An explicit init signal takes precedence over a Request's signal.
  const callerSignal = init && "signal" in init ? init.signal : inputSignal;
  const headers = new nodeFetch.Headers(
    ((init && init.headers) || inputHeaders) as nodeFetch.HeadersInit
  );
  headers.set("Accept-Encoding", "identity");

  const controller = new AbortController();
  const release = (): void => {
    if (callerSignal) {
      callerSignal.removeEventListener("abort", forwardAbort);
    }
  };
  const forwardAbort = (): void => {
    release();
    controller.abort(callerSignal ? callerSignal.reason : undefined);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      forwardAbort();
    } else {
      callerSignal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  try {
    const options: RequestInit & { readonly compress: false } = {
      ...init,
      compress: false,
      headers: Array.from(headers),
      signal: controller.signal
    };
    const response = await fetchApi(input, options);
    const contentEncoding = response.headers.get("Content-Encoding");
    if (
      typeof contentEncoding === "string" &&
      contentEncoding.trim().toLowerCase() !== "identity"
    ) {
      release();
      abortUnsupportedResponse(response.body, controller);
      throw new Error(
        "Unsupported Content-Encoding in downstream response; expected identity"
      );
    }

    // Keep cancellation connected while a Node response body is being consumed.
    if (callerSignal) {
      const body: unknown = response.body;
      if (body instanceof Readable) {
        releaseOnBodyCompletion(body, release);
      } else if (!body) {
        release();
      }
    }
    return response;
  } catch (error) {
    release();
    throw error;
  }
};
