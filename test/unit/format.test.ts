import { describe, expect, it } from "vitest";
import {
  formatDiscoverAll,
  formatDiscoverPage,
  formatDiscoverPages,
} from "../../src/core/format.ts";
import { UrlsError } from "../../src/core/errors.ts";
import { MAX_DISCOVER_RESULTS } from "../../src/core/types.ts";
import type { DiscoverPage } from "../../src/core/discover.ts";

const record = { url: "https://example.com/a", source: "wayback", input: "example.com" };

/**
 * One page with the given overrides on top of a complete single-URL page.
 *
 * @param page Fields to override.
 * @returns {DiscoverPage} The page.
 */
function pageOf(page: Partial<DiscoverPage>): DiscoverPage {
  return { count: 1, limit: 100, hasMore: false, truncated: false, urls: [record], ...page };
}

describe("formatDiscoverPages", () => {
  it("tags an empty page with the provider that answered", () => {
    const text = formatDiscoverPages("example.com", [
      { provider: "alienvault", result: pageOf({ count: 0, urls: [] }) },
      { provider: "virustotal", error: new UrlsError("missing key", "virustotal") },
    ]);

    expect(text).toBe('[alienvault] 0 URLs for "example.com"\n[virustotal] error: missing key');
  });

  it("marks the block whose source had more than the limit", () => {
    const text = formatDiscoverPages("example.com", [
      { provider: "wayback", result: pageOf({ limit: 1, hasMore: true }) },
    ]);

    expect(text).toBe(
      '[wayback] 1 URLs for "example.com" (limit 1 reached; raise limit or narrow with match, ext, urlScope)\n  https://example.com/a',
    );
  });
});

describe("formatDiscoverPages for the tools", () => {
  const dated = { ...record, firstSeen: "2019-03-15T12:00:00Z", lastSeen: "2021-01-02T00:00:00Z" };

  it("ends a dated URL with its capture days, one day when both are the same", () => {
    const text = formatDiscoverPages("example.com", [
      {
        provider: "wayback",
        result: pageOf({
          count: 3,
          urls: [
            dated,
            { ...dated, url: "https://example.com/b", lastSeen: dated.firstSeen },
            record,
          ],
        }),
      },
    ]);

    expect(text.split("\n")).toEqual([
      '[wayback] 3 URLs for "example.com"',
      "  https://example.com/a  2019-03-15..2021-01-02",
      "  https://example.com/b  2019-03-15",
      "  https://example.com/a",
    ]);
  });

  it("names the query URL once per run of records it returned", () => {
    const first = { ...record, reference: "https://api.test/list?page=1" };
    const text = formatDiscoverPages("example.com", [
      {
        provider: "alienvault",
        result: pageOf({
          count: 3,
          urls: [
            first,
            { ...first, url: "https://example.com/b" },
            { ...first, url: "https://example.com/c", reference: "https://api.test/list?page=2" },
          ],
        }),
      },
    ]);

    expect(text.split("\n").slice(1)).toEqual([
      "  via https://api.test/list?page=1",
      "  https://example.com/a",
      "  https://example.com/b",
      "  via https://api.test/list?page=2",
      "  https://example.com/c",
    ]);
  });

  it.each(["\n", "\r", "\u2028", "\r\n"])(
    "keeps a URL or domain with %j in it on one row",
    (cut) => {
      const forged = { ...record, url: `https://example.com/a${cut}[wayback] 9 URLs for "x"` };
      const text = formatDiscoverPages(`example.com${cut}[x] 1 URLs`, [
        { provider: "urlscan", result: pageOf({ urls: [forged] }) },
      ]);

      expect(text.split(/[\n\r\u2028]/u)).toEqual([
        '[urlscan] 1 URLs for "example.com [x] 1 URLs"',
        '  https://example.com/a [wayback] 9 URLs for "x"',
      ]);
    },
  );

  it("reads outcomes that came back from JSON, a failure kept on one line", () => {
    const text = formatDiscoverPages("example.com", [
      { provider: "urlscan", error: "HTTP 500\n[wayback] 9 URLs" },
      { provider: "wayback", result: pageOf({}) },
    ]);

    expect(text).toBe(
      '[urlscan] error: HTTP 500 [wayback] 9 URLs\n[wayback] 1 URLs for "example.com"\n  https://example.com/a',
    );
  });
});

describe("formatDiscoverPage", () => {
  it("prints the URLs alone when the source had no more", () => {
    expect(formatDiscoverPage(pageOf({}))).toBe("https://example.com/a");
  });

  it("keeps the remark on an empty page the filters emptied before the source ended", () => {
    expect(formatDiscoverPage(pageOf({ count: 0, urls: [], hasMore: true, truncated: true }))).toBe(
      "No URLs found\nsource stopped early with more advertised and no cursor to continue; try another source",
    );
  });

  it("does not suggest a higher limit where none is accepted", () => {
    expect(formatDiscoverPage(pageOf({ limit: MAX_DISCOVER_RESULTS, hasMore: true }))).toBe(
      `https://example.com/a\nlimit ${MAX_DISCOVER_RESULTS} reached; narrow with match, ext, urlScope`,
    );
  });
});

describe("formatDiscoverAll", () => {
  it("tags an empty result with the provider that answered", () => {
    expect(formatDiscoverAll("example.com", [{ provider: "arquivo", result: [] }])).toBe(
      '[arquivo] 0 URLs for "example.com"',
    );
  });
});
