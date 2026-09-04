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
