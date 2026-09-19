import { describe, expect, it } from "vitest";
import {
  formatDiscoverAll,
  formatDiscoverPage,
  formatDiscoverPages,
} from "../../src/core/format.ts";
import { UrlsError } from "../../src/core/errors.ts";

const record = { url: "https://example.com/a", source: "wayback", input: "example.com" };

describe("formatDiscoverPages", () => {
  it("tags an empty page with the provider that answered", () => {
    const text = formatDiscoverPages("example.com", [
      { provider: "alienvault", result: { count: 0, limit: 100, hasMore: false, urls: [] } },
      { provider: "virustotal", error: new UrlsError("missing key", "virustotal") },
    ]);

    expect(text).toBe('[alienvault] 0 URLs for "example.com"\n[virustotal] error: missing key');
  });

  it("marks the block whose source had more than the limit", () => {
    const text = formatDiscoverPages("example.com", [
      { provider: "wayback", result: { count: 1, limit: 1, hasMore: true, urls: [record] } },
    ]);

    expect(text).toBe(
      '[wayback] 1 URLs for "example.com" (limit 1 reached; raise limit or narrow with match, ext, urlScope)\n  https://example.com/a',
    );
  });
});

describe("formatDiscoverPage", () => {
  it("prints the URLs alone when the source had no more", () => {
    expect(formatDiscoverPage({ count: 1, limit: 100, hasMore: false, urls: [record] })).toBe(
      "https://example.com/a",
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
