import { describe, expect, it } from "vitest";
import {
  formatDiscoverAll,
  formatDiscoverPage,
  formatDiscoverPages,
} from "../../src/core/format.ts";
import { UrlsError } from "../../src/core/errors.ts";
import { MAX_DISCOVER_RESULTS } from "../../src/core/types.ts";
import type { DiscoverPage } from "../../src/tool-operations.ts";

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
