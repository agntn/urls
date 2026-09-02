import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitError, UrlsError } from "../../src/core/errors.ts";
import { create } from "../../src/core/registry.ts";
import { stubJSON } from "../helpers.ts";
import "../../src/providers/urlscan.ts";

/**
 * Live urlscan.io search sample captured 2026-09-02 (public search answers without a key at
 * smaller volumes; a key raises the limits). `sort` carries the Elasticsearch cursor.
 */
const PAGE_ONE = {
  has_more: true,
  total: 10000,
  results: [
    {
      page: { url: "https://example.com/" },
      sort: [1788349344062, "01a061ed-52ff-761a-ba30-df42f3b02a38"],
    },
    {
      page: { url: "http://www.example.com/old" },
      sort: [1788349344061, "01a061ed-52ff-761a-ba30-df42f3b02a39"],
    },
  ],
};

const PAGE_TWO = {
  has_more: false,
  results: [{ page: { url: "https://example.com/new" }, sort: [1788349344060, "zz"] }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urlscan provider", () => {
  it("serves discover", () => {
    expect(create("urlscan").capabilities).toEqual({ discover: true });
  });

  it("works without a key and paginates via search_after", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_ONE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_TWO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const urls = await create("urlscan").discover("example.com");

    expect(urls.map((url) => url.url)).toEqual([
      "https://example.com/",
      "http://www.example.com/old",
      "https://example.com/new",
    ]);
    const first = String(fetch.mock.calls[0]?.[0]);
    expect(first).toContain("q=domain%3Aexample.com");
    const second = String(fetch.mock.calls[1]?.[0]);
    expect(second).toContain("search_after=1788349344061%2C01a061ed-52ff-761a-ba30-df42f3b02a39");
  });

  it("sends the API-Key header when a key is configured", async () => {
    const fetch = stubJSON({ has_more: false, results: [] });

    await create("urlscan", { apiKey: "test-key" }).discover("example.com");

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init?.headers).get("API-Key")).toBe("test-key");
  });

  it("drops out-of-scope page URLs", async () => {
    stubJSON({
      has_more: false,
      results: [
        { page: { url: "https://offsite.test/collect" }, sort: [1, "a"] },
        { page: { url: "https://example.com/keep" }, sort: [0, "b"] },
      ],
    });

    const urls = await create("urlscan").discover("example.com");

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/keep"]);
  });

  it("rejects a malformed sort cursor instead of looping", async () => {
    stubJSON({ has_more: true, results: [{ page: { url: "https://example.com/a" }, sort: [] }] });

    await expect(create("urlscan").discover("example.com")).rejects.toBeInstanceOf(UrlsError);
  });

  it("stops when has_more arrives without results", async () => {
    stubJSON({ has_more: true, results: [] });

    const urls = await create("urlscan").discover("example.com");

    expect(urls).toEqual([]);
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubJSON({});

    await expect(create("urlscan").discover("   ")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps 429 responses to RateLimitError", async () => {
    stubJSON({ error: "rate limit exceeded" }, 429);

    await expect(create("urlscan").discover("example.com")).rejects.toBeInstanceOf(RateLimitError);
  });
});
