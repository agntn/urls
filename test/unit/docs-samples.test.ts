import { describe, expect, it } from "vitest";
import { listProviders, UrlCollector } from "../../src/index.ts";
import { LANDING_SAMPLES, restoreRecord } from "../../docs/app/utils/discover.ts";
import { PROVIDERS } from "../../docs/app/utils/providers.ts";

describe("docs landing samples", () => {
  it("rebuilds a stored record exactly as the collector wrote it", () => {
    const collector = new UrlCollector(undefined, "example.com");
    const seen = [
      ["wayback", "https://example.com/app.js?v=3&utm_source=x", "20190315120000"],
      ["urlscan", "https://example.com/search?q=1&Q=2", undefined],
      ["urlscan", "https://example.com/", undefined],
    ] as const;
    for (const [source, url, stamp] of seen) collector.push(source, url, undefined, stamp);
    for (const record of collector.results) {
      const { url, source, input, firstSeen, lastSeen } = record;
      const stored = { url, source, input, ...(firstSeen ? { firstSeen, lastSeen } : {}) };
      expect(JSON.stringify(restoreRecord(stored))).toBe(JSON.stringify(record));
    }
  });

  it("only names registered sources", () => {
    const keys = new Set(listProviders().map((listing) => listing.name));
    for (const sample of LANDING_SAMPLES) {
      for (const outcome of sample.outcomes) expect(keys.has(outcome.provider)).toBe(true);
    }
  });

  it("has presentation for every registered source", () => {
    expect(PROVIDERS.map((provider) => provider.key)).toEqual(
      listProviders().map((listing) => listing.name),
    );
  });
});
