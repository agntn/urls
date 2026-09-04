import { describe, expect, it } from "vitest";
import { clampMaxResults, MAX_DISCOVER_RESULTS } from "../../src/core/types.ts";
import {
  UrlCollector,
  extractUrls,
  inScope,
  normalizeHost,
  resolveDomain,
  urlMatchesScope,
} from "../../src/core/url.ts";

describe("extractUrls", () => {
  it("finds full URLs in prose", () => {
    expect(
      extractUrls("Read https://example.com/docs and http://sub.example.com:8080/a?q=1 now."),
    ).toEqual(["https://example.com/docs", "http://sub.example.com:8080/a?q=1"]);
  });

  it("trims trailing punctuation that is not part of the URL", () => {
    expect(extractUrls("see https://example.com/a). and https://example.com/b,")).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("deduplicates exact matches and ignores empty input", () => {
    expect(extractUrls("https://example.com/x https://example.com/x")).toEqual([
      "https://example.com/x",
    ]);
    expect(extractUrls("")).toEqual([]);
    expect(extractUrls("no urls here")).toEqual([]);
  });

  it("keeps encoded paths intact", () => {
    expect(extractUrls("https://example.com/a%2Fb?x=%20")).toEqual([
      "https://example.com/a%2Fb?x=%20",
    ]);
  });
});

describe("normalizeHost", () => {
  it("returns a bare domain unchanged, lowercased", () => {
    expect(normalizeHost("Example.COM")).toBe("example.com");
  });

  it("reduces a full URL to its hostname", () => {
    expect(normalizeHost("https://User@www.example.com:8080/path?q=1")).toBe("www.example.com");
  });

  it("drops protocol from schemeless inputs", () => {
    expect(normalizeHost("www.example.com/path")).toBe("www.example.com");
  });

  it("returns empty for empty input", () => {
    expect(normalizeHost("  ")).toBe("");
  });

  it("returns empty for input URL parsing rejects", () => {
    // WHATWG treats "!!!" as an opaque reg-name host, so it survives; a space cannot parse.
    expect(normalizeHost("foo bar")).toBe("");
  });

  it("strips path and userinfo while normalizing", () => {
    expect(normalizeHost("HTTPS://User@www.example.com:8080/a?q=1")).toBe("www.example.com");
  });

  it("rejects schemeless userinfo so the host after @ is not taken silently", () => {
    expect(normalizeHost("example.com@evil.com")).toBe("");
    expect(normalizeHost("user:pass@example.com")).toBe("");
  });
});

describe("resolveDomain", () => {
  it("passes a bare domain through and reduces a full URL to its host", () => {
    expect(resolveDomain("Example.COM", "alienvault")).toBe("example.com");
    expect(resolveDomain("https://user@www.example.com:8080/x", "alienvault")).toBe(
      "www.example.com",
    );
  });

  it("rejects empty and unparseable input before any request", () => {
    expect(() => resolveDomain("   ", "alienvault")).toThrow(/domain is empty/);
    expect(() => resolveDomain("foo bar", "alienvault")).toThrow(/invalid domain/);
  });

  it("rejects hosts that would traverse a request path", () => {
    expect(() => resolveDomain("..", "alienvault")).toThrow(/invalid domain/);
    expect(() => resolveDomain(".", "alienvault")).toThrow(/invalid domain/);
    expect(() => resolveDomain("foo..bar.com", "alienvault")).toThrow(/invalid domain/);
  });

  it("strips a trailing FQDN dot so the path stays on the domain endpoint", () => {
    expect(resolveDomain("example.com.", "alienvault")).toBe("example.com");
  });

  it("rejects a public suffix and schemeless userinfo, keeps localhost", () => {
    expect(() => resolveDomain("com", "alienvault")).toThrow(/invalid domain/);
    expect(() => resolveDomain("example.com@evil.com", "alienvault")).toThrow(/invalid domain/);
    expect(resolveDomain("localhost", "alienvault")).toBe("localhost");
    expect(resolveDomain("127.0.0.1", "alienvault")).toBe("127.0.0.1");
  });
});

describe("inScope", () => {
  it("keeps the apex and its subdomains", () => {
    expect(inScope("https://example.com/x", "example.com")).toBe(true);
    expect(inScope("https://www.example.com/x", "example.com")).toBe(true);
    expect(inScope("http://a.b.example.com/x", "example.com")).toBe(true);
  });

  it("rejects unrelated or suffix-spoofing hosts", () => {
    expect(inScope("https://other.com/x", "example.com")).toBe(false);
    expect(inScope("https://example.com.evil.test/x", "example.com")).toBe(false);
    expect(inScope("https://notexample.com/x", "example.com")).toBe(false);
  });

  it("does not treat a TLD as a parent of every host under it", () => {
    expect(inScope("https://example.com/x", "com")).toBe(false);
    expect(inScope("https://com/x", "com")).toBe(true);
  });
});

describe("urlMatchesScope", () => {
  it("treats a pattern without a star as a URL prefix with a path boundary", () => {
    expect(urlMatchesScope("https://example.com/api", "https://example.com/api")).toBe(true);
    expect(urlMatchesScope("https://example.com/api/v1", "https://example.com/api")).toBe(true);
    expect(urlMatchesScope("https://example.com/api?x=1", "https://example.com/api")).toBe(true);
    expect(urlMatchesScope("https://example.com/apiv2", "https://example.com/api")).toBe(false);
  });

  it("matches globs against the full URL, not a hostname", () => {
    expect(urlMatchesScope("https://cdn.example.com/app.js", "*.js")).toBe(true);
    expect(urlMatchesScope("https://example.com/admin/users", "*/admin/*")).toBe(true);
    expect(urlMatchesScope("https://other.test/admin/users", "https://example.com/*")).toBe(false);
  });
});

describe("clampMaxResults", () => {
  it("caps at max, floors at 1, and substitutes max for absent or non-finite", () => {
    expect(clampMaxResults(MAX_DISCOVER_RESULTS + 1, MAX_DISCOVER_RESULTS)).toBe(
      MAX_DISCOVER_RESULTS,
    );
    expect(clampMaxResults(0, MAX_DISCOVER_RESULTS)).toBe(1);
    expect(clampMaxResults(undefined, MAX_DISCOVER_RESULTS)).toBe(MAX_DISCOVER_RESULTS);
    expect(clampMaxResults(Number.NaN, MAX_DISCOVER_RESULTS)).toBe(MAX_DISCOVER_RESULTS);
  });
});

describe("UrlCollector", () => {
  it("applies the host-based scope by default", () => {
    const collector = new UrlCollector(undefined, "example.com");

    expect(collector.push("wayback", "https://www.example.com/a")).toBe(true);
    expect(collector.push("wayback", "https://offsite.com/a")).toBe(false);
    expect(collector.count).toBe(1);
    expect(collector.results[0]).toEqual({
      url: "https://www.example.com/a",
      source: "wayback",
      input: "example.com",
    });
  });

  it("keeps every URL when noScope is set", () => {
    const collector = new UrlCollector({ noScope: true }, "example.com");

    expect(collector.push("wayback", "https://offsite.com/a")).toBe(true);
  });

  it("keeps only URLs under urlScope and drops urlOutScope, still on the URL string", () => {
    const collector = new UrlCollector(
      { urlScope: ["https://example.com/api"], urlOutScope: ["https://example.com/api/internal"] },
      "example.com",
    );

    expect(collector.push("wayback", "https://example.com/api/v1")).toBe(true);
    expect(collector.push("wayback", "https://example.com/shop")).toBe(false);
    expect(collector.push("wayback", "https://example.com/api/internal/x")).toBe(false);
    expect(collector.count).toBe(1);
  });

  it("requires at least one match substring and drops any filter substring", () => {
    const collector = new UrlCollector(
      { match: ["shop"], filter: ["privacy", "terms"] },
      "example.com",
    );

    expect(collector.push("wayback", "https://example.com/shop/model")).toBe(true);
    expect(collector.push("wayback", "https://example.com/privacy")).toBe(false);
    expect(collector.push("wayback", "https://example.com/about")).toBe(false);
    expect(collector.count).toBe(1);
  });

  it("stops accepting URLs once the limit is reached", () => {
    const collector = new UrlCollector({ limit: 2 }, "example.com");

    expect(collector.push("wayback", "https://example.com/a")).toBe(true);
    expect(collector.push("wayback", "https://example.com/b")).toBe(true);
    expect(collector.done).toBe(true);
    expect(collector.push("wayback", "https://example.com/c")).toBe(false);
    expect(collector.count).toBe(2);
  });

  it("truncates a fractional limit so done is reached after the integer bound", () => {
    const collector = new UrlCollector({ limit: 1.9 }, "example.com");

    expect(collector.push("wayback", "https://example.com/a")).toBe(true);
    expect(collector.done).toBe(true);
    expect(collector.push("wayback", "https://example.com/b")).toBe(false);
  });

  it("deduplicates across pushes", () => {
    const collector = new UrlCollector({ noScope: true }, "example.com");

    expect(collector.push("alienvault", "https://example.com/a")).toBe(true);
    expect(collector.push("wayback", "https://example.com/a")).toBe(false);
    expect(collector.count).toBe(1);
  });

  it("deduplicates tracking-query variants via normalizeUrl", () => {
    const collector = new UrlCollector({ noScope: true }, "example.com");

    expect(collector.push("wayback", "https://example.com/a?utm_source=x")).toBe(true);
    expect(collector.push("wayback", "https://example.com/a")).toBe(false);
    expect(collector.count).toBe(1);
  });

  it("filters by extension and remaining query keys", () => {
    const collector = new UrlCollector({ ext: ["js"], hasQuery: true }, "example.com");

    expect(collector.push("wayback", "https://example.com/app.js?id=1")).toBe(true);
    expect(collector.push("wayback", "https://example.com/app.js")).toBe(false);
    expect(collector.push("wayback", "https://example.com/app.json?id=1")).toBe(false);
    expect(collector.results[0]).toMatchObject({ ext: "js", queryKeys: ["id"] });
  });

  it("keeps the earliest and latest timestamps on a normalized duplicate", () => {
    const collector = new UrlCollector(undefined, "example.com");

    expect(collector.push("wayback", "https://example.com/a", undefined, "20090101000000")).toBe(
      true,
    );
    expect(collector.push("wayback", "https://example.com/a", undefined, "20100101000000")).toBe(
      false,
    );
    expect(collector.results[0]).toMatchObject({
      firstSeen: "2009-01-01T00:00:00Z",
      lastSeen: "2010-01-01T00:00:00Z",
    });
  });

  it("drops occurrences outside the seen-at window", () => {
    const collector = new UrlCollector({ from: "2010", to: "2010" }, "example.com");

    expect(collector.push("wayback", "https://example.com/a", undefined, "20090101000000")).toBe(
      false,
    );
    expect(collector.push("wayback", "https://example.com/a", undefined, "20100601000000")).toBe(
      true,
    );
  });

  it("rejects an invalid seen-at bound instead of disabling the filter", () => {
    expect(() => new UrlCollector({ from: "not 2020" }, "example.com")).toThrow(
      'invalid from bound: "not 2020"',
    );
  });
});
