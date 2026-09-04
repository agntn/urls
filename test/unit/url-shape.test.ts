import { describe, expect, it } from "vitest";
import {
  archiveStampToIso,
  normalizeUrl,
  parseCdxNdjsonLine,
  parseCdxTextLine,
  parseTimeBound,
  uniqueQueryKeys,
  urlExtension,
  urlQueryKeys,
} from "../../src/core/url-shape.ts";

describe("normalizeUrl", () => {
  it("strips fragments, tracking query, trailing slash, and sorts remaining query", () => {
    expect(normalizeUrl("HTTPS://WWW.Example.COM/a/?b=2&utm_source=x&a=1#frag")).toBe(
      "https://www.example.com/a?a=1&b=2",
    );
  });

  it("keeps a root path slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });
});

describe("urlExtension and urlQueryKeys", () => {
  it("reads the last path extension", () => {
    expect(urlExtension("https://example.com/app.JS")).toBe("js");
    expect(urlExtension("https://example.com/a")).toBeUndefined();
  });

  it("drops tracking keys and keeps the rest in first-seen order", () => {
    expect(urlQueryKeys("https://example.com/?utm_source=x&redirect=/a&file=1")).toEqual([
      "redirect",
      "file",
    ]);
  });

  it("unions query keys across a result set", () => {
    expect(
      uniqueQueryKeys(["https://example.com/?id=1", "https://example.com/?id=2&next=/"]),
    ).toEqual(["id", "next"]);
  });
});

describe("archive timestamps", () => {
  it("converts a 14-digit stamp to UTC ISO", () => {
    expect(archiveStampToIso("20091014042001")).toBe("2009-10-14T04:20:01Z");
  });

  it("stretches a year bound so from/to=2019 covers the year", () => {
    expect(parseTimeBound("2019", "from")).toBe("20190000000000");
    expect(parseTimeBound("2019", "to")).toBe("20199999999999");
  });

  it("normalizes ISO times to UTC before comparing timestamps", () => {
    expect(parseTimeBound("2020-01-01T00:00:00+02:00", "from")).toBe("20191231220000");
    expect(parseTimeBound("2020-01-01T00:00:00", "from")).toBe("20200101000000");
  });

  it("rejects text containing a year and impossible ISO calendar dates", () => {
    expect(parseTimeBound("not 2020", "from")).toBeUndefined();
    expect(parseTimeBound("2021-02-29", "from")).toBeUndefined();
  });
});

describe("CDX line parsers", () => {
  it("splits a Wayback text line into url and timestamp", () => {
    expect(parseCdxTextLine("http://example.com:80/ 20020120142510")).toEqual({
      url: "http://example.com:80/",
      timestamp: "20020120142510",
    });
    expect(parseCdxTextLine("https://example.com/docs")).toEqual({
      url: "https://example.com/docs",
    });
  });

  it("reads NDJSON url and timestamp fields", () => {
    expect(
      parseCdxNdjsonLine('{"url": "https://example.com/", "timestamp": "20091014042001"}'),
    ).toEqual({ url: "https://example.com/", timestamp: "20091014042001" });
  });
});
