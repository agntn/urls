import { afterEach, describe, expect, it, vi } from "vitest";
import { create } from "../../src/core/registry.ts";
import { stubText } from "../helpers.ts";
import "../../src/providers/wayback.ts";

/** Live CDX text sample captured 2026-09-02 (output=txt, fl=original). */
const CDX_BODY = [
  "http://example.com:80/",
  "http://www.example.com:80/",
  "https://example.com/docs/index.html",
  "",
  "https://weird.example.com/assets/a%20b.png",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wayback provider", () => {
  it("serves discover", async () => {
    expect((await create("wayback")).capabilities).toEqual({ discover: true });
  });

  it("extracts one URL per line and tags source and input", async () => {
    const fetch = stubText(CDX_BODY);

    const urls = await (await create("wayback")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual([
      "http://example.com:80/",
      "http://www.example.com:80/",
      "https://example.com/docs/index.html",
      "https://weird.example.com/assets/a%20b.png",
    ]);
    expect(urls[0]).toMatchObject({ source: "wayback", input: "example.com" });
    const requestUrl = String(fetch.mock.calls[0]?.[0] as string);
    expect(requestUrl).toContain("/cdx/search/cdx?");
    expect(requestUrl).toContain("fl=original");
    expect(requestUrl).not.toContain("collapse");
  });

  it("asks for the whole domain, not the apex prefix", async () => {
    const fetch = stubText(CDX_BODY);

    await (await create("wayback")).discover("https://user@www.example.com:8080/docs");

    const query = new URL(String(fetch.mock.calls[0]?.[0] as string)).searchParams;
    expect(query.get("url")).toBe("www.example.com");
    expect(query.get("matchType")).toBe("domain");
  });

  it("asks for each URL-scope prefix instead of the whole domain", async () => {
    const fetch = stubText("https://example.com/wanted/a\nhttps://example.com/unrelated/b\n");

    const urls = await (
      await create("wayback")
    ).discover("example.com", {
      urlScope: ["https://example.com/wanted/*", "https://docs.example.com/API"],
    });

    const queries = fetch.mock.calls.map((call) => new URL(String(call[0])).searchParams);
    expect(queries.map((query) => [query.get("url"), query.get("matchType")])).toEqual([
      ["docs.example.com/api", "prefix"],
      ["example.com/wanted/", "prefix"],
    ]);
    expect(urls.map((url) => url.url)).toEqual(["https://example.com/wanted/a"]);
  });

  it("folds a prefix that another one already covers", async () => {
    const fetch = stubText("");

    await (
      await create("wayback")
    ).discover("example.com", {
      urlScope: [
        "https://example.com/docs",
        "http://example.com/docs/api",
        "https://www.example.com/docs",
      ],
    });

    expect(
      fetch.mock.calls.map((call) => new URL(String(call[0])).searchParams.get("url")),
    ).toEqual(["example.com/docs"]);
  });

  it.each([
    ["a glob before the path", ["https://*.example.com/docs"]],
    ["a host outside the domain", ["https://example.org/docs"]],
    ["a query in the prefix", ["https://example.com/search?q=1"]],
    ["a port in the prefix", ["https://example.com:8080/docs"]],
    ["a dot segment in the path", ["https://example.com/a/../docs"]],
    ["a dot segment at the end", ["https://example.com/docs/.."]],
    ["an empty segment in the path", ["https://example.com//docs"]],
    ["one narrow and one broad pattern", ["https://example.com/docs", "https://example.com*"]],
    [
      "more prefixes than requests are worth",
      Array.from({ length: 9 }, (_, i) => `https://example.com/p${i}`),
    ],
  ])("asks for the whole domain with %s", async (_name, urlScope) => {
    const fetch = stubText("");

    await (await create("wayback")).discover("example.com", { urlScope });

    expect(fetch).toHaveBeenCalledOnce();
    const query = new URL(String(fetch.mock.calls[0]?.[0])).searchParams;
    expect([query.get("url"), query.get("matchType")]).toEqual(["example.com", "domain"]);
  });

  it("stops before the next prefix once the limit is reached", async () => {
    const fetch = stubText("https://example.com/a/1\nhttps://example.com/b/1\n");

    const urls = await (
      await create("wayback")
    ).discover("example.com", {
      urlScope: ["https://example.com/a", "https://example.com/b"],
      limit: 1,
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(urls.map((url) => url.url)).toEqual(["https://example.com/a/1"]);
  });

  it("deduplicates exact URLs across lines", async () => {
    stubText("https://example.com/a\nhttps://example.com/a\nhttps://example.com/b\n");

    const urls = await (await create("wayback")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("drops off-scope lines silently", async () => {
    stubText("https://cdn.other.test/lib.js\nhttps://example.com/keep\n");

    const urls = await (await create("wayback")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/keep"]);
  });

  it("caps results at the requested limit", async () => {
    stubText(CDX_BODY);

    const urls = await (await create("wayback")).discover("example.com", { limit: 2 });

    expect(urls).toHaveLength(2);
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubText("");

    await expect((await create("wayback")).discover("   ")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid time bound without any request", async () => {
    const fetch = stubText("");

    await expect(
      (await create("wayback")).discover("example.com", { from: "not 2020" }),
    ).rejects.toMatchObject({ name: "InvalidInputError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
