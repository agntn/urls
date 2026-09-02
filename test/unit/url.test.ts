import { describe, expect, it } from "vitest";
import {
  UrlCollector,
  extractUrls,
  inScope,
  normalizeHost,
  resolveDomain,
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

  it("deduplicates across pushes", () => {
    const collector = new UrlCollector({ noScope: true }, "example.com");

    expect(collector.push("alienvault", "https://example.com/a")).toBe(true);
    expect(collector.push("wayback", "https://example.com/a")).toBe(false);
    expect(collector.count).toBe(1);
  });
});
