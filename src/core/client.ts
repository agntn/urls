/** HTTP client wrapper for Urls providers */

import { normalizeError, ResponseError } from "./errors.ts";
import { version } from "../version.ts";

/** Identifying User-Agent: passive sources log anonymous traffic per their usage policies. */
const USER_AGENT = `agntn-urls/${version} (https://github.com/agntn/urls)`;

/** Request metadata shared by the HTTP helpers. */
export interface ClientOptions {
  readonly timeout?: number;
  readonly headers?: { readonly [header: string]: string };
  readonly signal?: AbortSignal;
  readonly provider?: string;
}

/**
 * Fetch JSON with Urls headers and a 30-second default timeout.
 *
 * Passive enumeration can legitimately take longer than an interactive read; the default is
 * twice the family's interactive default. The timeout is composed with the caller's signal.
 *
 * Plain `fetch`, like `getTextLines`: these GET requests use nothing a wrapper adds, and
 * loading one would land on every Pi and OMP first call and every MCP start. The body is parsed
 * whatever the content type says, so a non-JSON answer fails as an error instead of passing
 * through as a string. A non-2xx answer keeps its body text for `HTTPError`.
 *
 * Transport failures are normalized before they leave this boundary; a caller abort is
 * rethrown as the caller's reason.
 *
 * @param url Request URL.
 * @param options Request metadata.
 * @returns {Promise<T>} The parsed JSON body.
 */
export async function getJSON<T>(url: string, options?: ClientOptions): Promise<T> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...options?.headers,
      },
      signal: combinedSignal(options, 30_000),
      redirect: "follow",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ResponseError(response.status, url, body);
    }
    return (await response.json()) as T;
  } catch (error) {
    options?.signal?.throwIfAborted();
    throw normalizeError(error, options?.provider, url);
  }
}

/**
 * Yield text lines from a streaming response, one line at a time.
 *
 * CDX dumps can reach tens of megabytes, so this helper classifies the status before reading
 * any body bytes. Callers break early (once a limit is hit) and the reader is cancelled. Requests
 * carry a 60-second default timeout, composed with the caller's own signal when one is given;
 * a caller abort surfaces as the caller's reason whether it lands before or during the body.
 *
 * @param url Request URL.
 * @param options Request metadata.
 * @yields {string} One line without its newline terminator.
 */
export async function* getTextLines(url: string, options?: ClientOptions): AsyncGenerator<string> {
  const response = await fetchText(url, options);
  if (!response.body) return;
  try {
    for await (const line of readLines(response.body)) {
      yield line;
    }
  } catch (error) {
    options?.signal?.throwIfAborted();
    throw error;
  }
}

/**
 * Fetch a text response, mapping transport and HTTP failures before the body is read.
 *
 * @param url Request URL.
 * @param options Request metadata.
 * @returns {Promise<Response>} A response known to be in the 2xx range.
 */
async function fetchText(url: string, options?: ClientOptions): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/plain, */*",
        "User-Agent": USER_AGENT,
        ...options?.headers,
      },
      signal: combinedSignal(options, 60_000),
      redirect: "follow",
    });
  } catch (error) {
    options?.signal?.throwIfAborted();
    throw normalizeError(error, options?.provider, url);
  }
  if (!response.ok) {
    // Read nothing before mapping the status: a text/plain 4xx/5xx must surface as an HTTP
    // error, not as raw HTML that larger layers would try to decode.
    await response.body?.cancel().catch(() => undefined);
    throw normalizeError(new Error(`HTTP ${response.status} from ${url}`), options?.provider, url);
  }
  return response;
}

/**
 * Compose the caller's signal with the request timeout.
 *
 * @param options Request metadata.
 * @param defaultTimeout Timeout in milliseconds when the options carry none.
 * @returns {AbortSignal} A signal that aborts on timeout or on the caller's cancellation.
 */
function combinedSignal(options: ClientOptions | undefined, defaultTimeout: number): AbortSignal {
  const timeout = AbortSignal.timeout(options?.timeout ?? defaultTimeout);
  return options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

/**
 * Split a response stream into complete lines, preserving a final unterminated line.
 *
 * @param body Streaming response body.
 * @yields {string} One line without its newline terminator.
 */
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        yield line;
      }
    }
    const tail = buffer + decoder.decode();
    if (tail) yield tail;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Build a query string while dropping parameters whose value is `undefined`.
 *
 * @param params Query parameters.
 * @returns {string} The query string.
 *
 * @example
 *   ```ts
 *   buildQuery({ page: 2, q: undefined }); // '?page=2'
 *   ```
 */
export function buildQuery(params: Readonly<Record<string, string | number | undefined>>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) usp.set(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}
