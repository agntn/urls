/** Urls error hierarchy */

import { FetchError } from "ofetch";

/**
 * Base class for failures surfaced through Urls.
 *
 * Every message passes through `sanitizeUrl` here, so secret query params - the
 * VirusTotal `x-apikey` is a header, but keys in URLs from other sources are not - are
 * redacted at one boundary instead of at each construction site.
 */
export class UrlsError extends Error {
  readonly provider?: string;

  constructor(message: string, provider?: string) {
    super(sanitizeUrl(message));
    this.name = "UrlsError";
    this.provider = provider;
  }
}

/**
 * Strip API keys from URLs and URL-bearing text for safe error messages.
 *
 * @param text URL or URL-bearing text.
 * @returns {string} Text with secret query params replaced by REDACTED.
 */
function sanitizeUrl(text: string): string {
  return text.replaceAll(/([?&])(api[-_]?key|key|secret|token)=[^&#]*/gi, "$1$2=REDACTED");
}

/** HTTP failure with a redacted request URL in its message and a redacted response body. */
export class HTTPError extends UrlsError {
  readonly statusCode: number;

  /** Request URL with secrets redacted. Non-enumerable to keep serialized errors compact. */
  readonly rawUrl: string;

  /** Response body, redacted in case the server echoes the request URL. */
  readonly body?: string;

  constructor(statusCode: number, url: string, body?: string, provider?: string) {
    super(`HTTP ${statusCode} from ${url}`, provider);
    this.statusCode = statusCode;
    if (body !== undefined) this.body = sanitizeUrl(body);
    this.rawUrl = sanitizeUrl(url);
    Object.defineProperty(this, "rawUrl", { enumerable: false });
    this.name = "HTTPError";
  }
}

/** Provider credentials were missing or rejected. */
export class AuthError extends UrlsError {
  constructor(provider: string, detail?: string) {
    super(`Authentication failed for ${provider}${detail ? `: ${detail}` : ""}`, provider);
    this.name = "AuthError";
  }
}

/** Provider demands payment or an upgraded plan for the request. */
export class PaymentError extends UrlsError {
  readonly statusCode: number;

  constructor(provider: string, statusCode = 402) {
    super(`Payment required by ${provider} (HTTP ${statusCode})`, provider);
    this.statusCode = statusCode;
    this.name = "PaymentError";
  }
}

/** Provider refused a request because its rate limit was reached. */
export class RateLimitError extends UrlsError {
  readonly retryAfter?: number;

  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limited by ${provider}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}`,
      provider,
    );
    this.retryAfter = retryAfter;
    this.name = "RateLimitError";
  }
}

/** Requested input could not be resolved by the provider. */
export class NotFoundError extends UrlsError {
  constructor(resource: string, provider?: string) {
    super(`Not found: ${resource}`, provider);
    this.name = "NotFoundError";
  }
}

/** Provider backend does not expose the requested operation. */
export class UnsupportedOperationError extends UrlsError {
  constructor(operation: string, provider: string) {
    super(`Operation "${operation}" not supported by ${provider}`, provider);
    this.name = "UnsupportedOperationError";
  }
}

/** Registry does not contain the requested provider name. */
export class UnknownProviderError extends UrlsError {
  constructor(provider: string) {
    super(`Unknown provider: ${provider}`, provider);
    this.name = "UnknownProviderError";
  }
}

/** Caller input failed validation before any request was sent. */
export class InvalidInputError extends UrlsError {
  constructor(message: string, provider?: string) {
    super(message, provider);
    this.name = "InvalidInputError";
  }
}

/**
 * Extract the request URL from an ofetch failure.
 *
 * @param error ofetch failure.
 * @returns {string | undefined} The request URL, when available.
 */
function getFetchErrorUrl(error: FetchError): string | undefined {
  const request = error.request;
  return typeof request === "string" ? request : request?.url;
}

/**
 * Extract a JSON-safe response body from an ofetch failure.
 *
 * @param error ofetch failure.
 * @returns {string | undefined} The response body, when available.
 */
function getFetchErrorBody(error: FetchError): string | undefined {
  if (typeof error.data === "string") return error.data;
  if (error.data === undefined) return undefined;
  try {
    return JSON.stringify(error.data);
  } catch {
    return String(error.data);
  }
}

/** Failure classes the hierarchy distinguishes. */
type FailureKind = "notFound" | "rateLimit" | "payment" | "auth" | "transport" | "generic";

function isNotFound(status: number, lower: string): boolean {
  return status === 404 || lower.includes("not found");
}

function isRateLimit(status: number, lower: string): boolean {
  return status === 429 || lower.includes("rate limit");
}

function isAuth(status: number, lower: string): boolean {
  return (
    status === 401 ||
    status === 403 ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  );
}

function isTransport(status: number, lower: string, hasUrl: boolean): boolean {
  return (
    status > 0 ||
    hasUrl ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("timeouterror")
  );
}

function classifyFailure(status: number, lower: string, hasUrl: boolean): FailureKind {
  if (isNotFound(status, lower)) return "notFound";
  if (isRateLimit(status, lower)) return "rateLimit";
  if (status === 402) return "payment";
  if (isAuth(status, lower)) return "auth";
  if (isTransport(status, lower, hasUrl)) return "transport";
  return "generic";
}

/**
 * Turn an unknown provider or transport failure into the Urls error hierarchy.
 *
 * Existing `UrlsError` instances pass through unchanged. Structured HTTP failures retain their
 * status, response body, and redacted request URL.
 *
 * @param error Unknown failure.
 * @param provider Registry key of the provider that failed.
 * @param requestUrl Request URL when the failure did not carry one.
 * @returns {UrlsError} A member of the hierarchy.
 */
export function normalizeError(error: unknown, provider?: string, requestUrl?: string): UrlsError {
  if (error instanceof UrlsError) return error;

  const message = messageOf(error);
  const lowerMessage = message.toLowerCase();
  const fetchError = fetchErrorOf(error);
  const status = statusOf(fetchError, message);
  const url = urlOf(fetchError, requestUrl);
  const kind = classifyFailure(status, lowerMessage, url !== undefined);

  switch (kind) {
    case "notFound": {
      return notFoundError(url, message, provider);
    }
    case "rateLimit": {
      return new RateLimitError(unit(provider), parseRetryAfter(lowerMessage));
    }
    case "payment": {
      return new PaymentError(unit(provider), status);
    }
    case "auth": {
      return authError(url, status, message, provider);
    }
    case "transport": {
      return new HTTPError(status, unit(url), bodyOf(fetchError, message), provider);
    }
    default: {
      return new UrlsError(message, provider);
    }
  }
}

/**
 * Build the not-found member of the hierarchy.
 *
 * @param url Request URL, when known.
 * @param message Original failure message.
 * @param provider Registry key of the provider that failed.
 * @returns {NotFoundError} The not-found error.
 */
function notFoundError(
  url: string | undefined,
  message: string,
  provider: string | undefined,
): NotFoundError {
  return new NotFoundError(url ?? message, provider);
}

/**
 * Build the auth member of the hierarchy.
 *
 * @param url Request URL, when known.
 * @param status HTTP status, when known.
 * @param message Original failure message.
 * @param provider Registry key of the provider that failed.
 * @returns {AuthError} The auth error.
 */
function authError(
  url: string | undefined,
  status: number,
  message: string,
  provider: string | undefined,
): AuthError {
  const detail = url ? `HTTP ${status} from ${url}` : message;
  return new AuthError(unit(provider), detail);
}

/**
 * Read the message of an unknown failure.
 *
 * @param error Unknown failure.
 * @returns {string} The failure message.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Narrow an unknown failure to an ofetch failure, if it is one.
 *
 * @param error Unknown failure.
 * @returns {FetchError | undefined} The fetch failure, when the failure came from ofetch.
 */
function fetchErrorOf(error: unknown): FetchError | undefined {
  return error instanceof FetchError ? error : undefined;
}

/**
 * Read the HTTP status from an ofetch failure or an embedded `HTTP NNN` message.
 *
 * @param fetchError ofetch failure, when present.
 * @param message Original failure message.
 * @returns {number} The HTTP status, or 0 when none is known.
 */
function statusOf(fetchError: FetchError | undefined, message: string): number {
  return fetchError?.statusCode ?? Number(message.match(/HTTP (\d{3})/i)?.[1] ?? 0);
}

/**
 * Resolve the request URL carried by the failure or the caller.
 *
 * @param fetchError ofetch failure, when present.
 * @param requestUrl Caller-provided request URL.
 * @returns {string | undefined} The request URL, when known.
 */
function urlOf(
  fetchError: FetchError | undefined,
  requestUrl: string | undefined,
): string | undefined {
  return requestUrl ?? (fetchError ? getFetchErrorUrl(fetchError) : undefined);
}

/**
 * Resolve the fallback provider name when none was supplied.
 *
 * @param provider Registry key, when present.
 * @returns {string} Provider name or the generic marker.
 */
function unit(provider: string | undefined): string {
  return provider ?? "unknown";
}

/**
 * Resolve the response body carried by the failure, falling back to the message.
 *
 * @param fetchError ofetch failure, when present.
 * @param message Original failure message.
 * @returns {string} The response body or the message.
 */
function bodyOf(fetchError: FetchError | undefined, message: string): string {
  return (fetchError ? getFetchErrorBody(fetchError) : undefined) ?? message;
}

/**
 * Read a retry hint from an error message.
 *
 * @param lowerMessage Lowercased error message.
 * @returns {number | undefined} Seconds to wait, when the message names one.
 */
function parseRetryAfter(lowerMessage: string): number | undefined {
  const match = lowerMessage.match(/retry\s*after\s*[:=]?\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : undefined;
}
