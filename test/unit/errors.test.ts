import { createFetchError, FetchError } from "ofetch";
import { describe, expect, it } from "vitest";
import {
  AuthError,
  HTTPError,
  PaymentError,
  RateLimitError,
  UrlsError,
  normalizeError,
} from "../../src/core/errors.ts";

describe("UrlsError sanitization", () => {
  it("redacts secret query params at the error boundary", () => {
    const error = new UrlsError("failed https://api.example.com/?api_key=SECRET&x=1");

    expect(error.message).not.toContain("SECRET");
    expect(error.message).toContain("api_key=REDACTED");
  });

  it("redacts secrets that only appear in the body", () => {
    const error = new HTTPError(
      401,
      "https://api.example.com/report?apikey=SECRET",
      JSON.stringify({ request: "https://api.example.com/report?apikey=SECRET", error: "bad" }),
    );

    expect(error.message).not.toContain("SECRET");
    expect(error.rawUrl).not.toContain("SECRET");
    expect(error.body).not.toContain("SECRET");
    expect(error.body).toContain("apikey=REDACTED");
  });
});

describe("normalizeError", () => {
  it("passes existing UrlsError instances through", () => {
    const error = new AuthError("virustotal");
    expect(normalizeError(error, "virustotal")).toBe(error);
  });

  it("maps 401 and 403 to AuthError", () => {
    const error = new FetchError("HTTP 401", "https://api.example.com", {
      statusCode: 401,
    });

    expect(normalizeError(error, "virustotal")).toBeInstanceOf(AuthError);
  });

  it("maps 402 to PaymentError", () => {
    const error = new FetchError("HTTP 402", "https://api.example.com", {
      statusCode: 402,
    });

    expect(normalizeError(error, "urlscan")).toBeInstanceOf(PaymentError);
  });

  it("maps 429 to RateLimitError and reads retry-after", () => {
    const error = new FetchError("HTTP 429", "https://api.example.com", {
      statusCode: 429,
    });

    const normalized = normalizeError(error, "urlscan");
    expect(normalized).toBeInstanceOf(RateLimitError);
  });

  it("reads rate-limit hints from message text", () => {
    const normalized = normalizeError(
      new Error("rate limited, retry after 42s"),
      "alienvault",
    ) as RateLimitError;

    expect(normalized).toBeInstanceOf(RateLimitError);
    expect(normalized.retryAfter).toBe(42);
  });

  it("maps transport failures to HTTPError without a status", () => {
    // Construct the error the way ofetch does at runtime, so the request getter exists.
    const error = createFetchError({
      request: new Request("https://index.commoncrawl.org/collinfo.json"),
      options: { method: "GET" },
      error: new Error("fetch failed"),
    });

    const normalized = normalizeError(error, "commoncrawl");
    expect(normalized).toBeInstanceOf(HTTPError);
    expect((normalized as HTTPError).statusCode).toBe(0);
    expect(normalized.message).toContain("index.commoncrawl.org");
  });

  it("falls back to the base UrlsError for unknown failures", () => {
    expect(normalizeError(new Error("something broke"), "wayback")).toBeInstanceOf(UrlsError);
  });
});
