import { afterEach, describe, expect, it, vi } from "vitest";
import { create } from "../../src/core/registry.ts";
import { stubText } from "../helpers.ts";
import "../../src/providers/arquivo.ts";

/**
 * Live Arquivo.pt CDX sample captured 2026-09-02 (`output=json`, `fields=url`, `limit=8`).
 * `output=txt` is rejected; omit `limit` and the endpoint hangs with an empty 200 body.
 */
const CDX_BODY = [
  '{"url": "http://user:pass@example.com/"}',
  '{"url": "http://www.example.com/"}',
  '{"url": "http://user:pass@example.com/"}',
  '{"url": "http://www.example.com/"}',
  '{"url": "https://example.com/docs"}',
  "not-json",
  '{"url": 12}',
  "",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("arquivo provider", () => {
  it("serves discover", async () => {
    expect((await create("arquivo")).capabilities).toEqual({ discover: true });
  });

  it("parses NDJSON url fields and tags source and input", async () => {
    const fetch = stubText(CDX_BODY);

    const urls = await (await create("arquivo")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual([
      "http://user:pass@example.com/",
      "http://www.example.com/",
      "https://example.com/docs",
    ]);
    expect(urls[0]).toMatchObject({ source: "arquivo", input: "example.com" });
    const requestUrl = String(fetch.mock.calls[0]?.[0] as string);
    expect(requestUrl).toContain("/wayback/cdx?");
    expect(requestUrl).toContain("matchType=domain");
    expect(requestUrl).toContain("output=json");
    expect(requestUrl).toContain("fields=url");
    expect(requestUrl).toContain("limit=");
    expect(requestUrl).not.toContain("output=txt");
  });

  it("sends a page-safeguard CDX limit, not the unique-result bound", async () => {
    const fetch = stubText(CDX_BODY);

    const urls = await (await create("arquivo")).discover("example.com", { limit: 2 });

    expect(urls).toHaveLength(2);
    const requestUrl = String(fetch.mock.calls[0]?.[0] as string);
    expect(requestUrl).toContain("limit=10000");
    expect(requestUrl).not.toMatch(/[?&]limit=2(?:&|$)/);
  });

  it("reports a response that fills the request cap as cut, a shorter one as complete", async () => {
    const full = Array.from({ length: 10_000 }, (_, i) => `{"url": "https://example.com/${i}"}`);
    stubText(`${full.join("\n")}\n`);
    const onTruncated = vi.fn();
    const provider = await create("arquivo");

    const urls = await provider.discover("example.com", { onTruncated });
    expect(urls).toHaveLength(10_000);
    expect(onTruncated).toHaveBeenCalledExactlyOnceWith("arquivo");

    stubText(CDX_BODY);
    const complete = vi.fn();
    await provider.discover("example.com", { onTruncated: complete });
    expect(complete).not.toHaveBeenCalled();
  });

  it("drops off-scope lines silently", async () => {
    stubText('{"url": "https://cdn.other.test/lib.js"}\n{"url": "https://example.com/keep"}\n');

    const urls = await (await create("arquivo")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/keep"]);
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubText("");

    await expect((await create("arquivo")).discover("   ")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
