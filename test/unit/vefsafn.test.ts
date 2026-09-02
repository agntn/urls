import { afterEach, describe, expect, it, vi } from "vitest";
import { create } from "../../src/core/registry.ts";
import { stubText } from "../helpers.ts";
import "../../src/providers/vefsafn.ts";

/**
 * Live Vefsafn CDX sample captured 2026-09-02 (`output=json`, `fields=url`, `matchType=domain`).
 * `output=txt` is rejected; `limit` is ignored by the server.
 */
const CDX_BODY = [
  '{"url": "http://example.com/"}',
  '{"url": "http://www.example.com/"}',
  '{"url": "http://www.example.com/"}',
  '{"url": "https://example.com/docs"}',
  "not-json",
  '{"url": 12}',
  "",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vefsafn provider", () => {
  it("serves discover", async () => {
    expect((await create("vefsafn")).capabilities).toEqual({ discover: true });
  });

  it("parses NDJSON url fields and tags source and input", async () => {
    const fetch = stubText(CDX_BODY);

    const urls = await (await create("vefsafn")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual([
      "http://example.com/",
      "http://www.example.com/",
      "https://example.com/docs",
    ]);
    expect(urls[0]).toMatchObject({ source: "vefsafn", input: "example.com" });
    const requestUrl = String(fetch.mock.calls[0]?.[0] as string);
    expect(requestUrl).toContain("/cdx?");
    expect(requestUrl).toContain("matchType=domain");
    expect(requestUrl).toContain("output=json");
    expect(requestUrl).toContain("fields=url");
    expect(requestUrl).not.toContain("output=txt");
  });

  it("stops reading once the collector limit is reached", async () => {
    stubText(CDX_BODY);

    const urls = await (await create("vefsafn")).discover("example.com", { limit: 2 });

    expect(urls).toHaveLength(2);
  });

  it("drops off-scope lines silently", async () => {
    stubText('{"url": "https://cdn.other.test/lib.js"}\n{"url": "https://example.com/keep"}\n');

    const urls = await (await create("vefsafn")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/keep"]);
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubText("");

    await expect((await create("vefsafn")).discover("   ")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
