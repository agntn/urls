import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitError } from "../../src/core/errors.ts";
import { create } from "../../src/core/registry.ts";
import { stubJSON } from "../helpers.ts";
import "../../src/providers/alienvault.ts";

/** Live OTX sample captured 2026-09-02 for page 1 of example.com. */
const PAGE_ONE = {
  has_next: true,
  page_num: 1,
  actual_size: 22470,
  url_list: [
    {
      url: "http://gitlab.example.com/mirror/github.com/openai/skills",
      date: "2026-09-02T10:38:26",
      domain: "example.com",
      hostname: "gitlab.example.com",
    },
    {
      url: "https://offsite.example.test/collect",
      date: "2026-09-01T09:00:00",
      domain: "example.com",
    },
  ],
};

const PAGE_TWO = { has_next: false, page_num: 2, url_list: [{ url: "https://example.com/a" }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("alienvault provider", () => {
  it("serves discover", async () => {
    expect((await create("alienvault")).capabilities).toEqual({ discover: true });
  });

  it("paginates while has_next and tags each URL with source, input, and reference", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_ONE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_TWO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const urls = await (await create("alienvault")).discover("example.com");

    expect(urls).toEqual([
      expect.objectContaining({
        url: "http://gitlab.example.com/mirror/github.com/openai/skills",
        source: "alienvault",
        input: "example.com",
      }),
      expect.objectContaining({ url: "https://example.com/a" }),
    ]);
    expect(fetch.mock.calls).toHaveLength(2);
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/url_list?page=1");
    expect(String(fetch.mock.calls[1]?.[0])).toContain("/url_list?page=2");
    expect(urls[0]?.reference).toContain("page=1");
  });

  it("reports the page safeguard only when has_next survives it", async () => {
    const endless = vi.fn(
      async (input: string) =>
        new Response(
          JSON.stringify({
            has_next: true,
            url_list: [{ url: `https://example.com/${new URL(input).searchParams.get("page")}` }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", endless);
    const provider = await create("alienvault");

    const onTruncated = vi.fn();
    const urls = await provider.discover("example.com", { onTruncated });
    expect(urls).toHaveLength(20);
    expect(endless).toHaveBeenCalledTimes(20);
    expect(onTruncated).toHaveBeenCalledExactlyOnceWith("alienvault");

    const stoppedByLimit = vi.fn();
    await provider.discover("example.com", { limit: 3, onTruncated: stoppedByLimit });
    expect(stoppedByLimit).not.toHaveBeenCalled();

    stubJSON(PAGE_TWO);
    const lastPage = vi.fn();
    await provider.discover("example.com", { onTruncated: lastPage });
    expect(lastPage).not.toHaveBeenCalled();
  });

  it("applies the host-based scope and drops off-host URLs", async () => {
    stubJSON(PAGE_ONE);

    const urls = await (await create("alienvault")).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual([
      "http://gitlab.example.com/mirror/github.com/openai/skills",
    ]);
    expect(urls).not.toContainEqual(
      expect.objectContaining({ url: "https://offsite.example.test/collect" }),
    );
  });

  it("respects the match filter", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_ONE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_TWO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const urls = await (await create("alienvault")).discover("example.com", { match: ["mirror"] });
    expect(urls.map((url) => url.url)).toEqual([
      "http://gitlab.example.com/mirror/github.com/openai/skills",
    ]);
  });

  it("normalizes a full URL input to its host for the request", async () => {
    const fetch = stubJSON({ has_next: false, url_list: [] });

    await (await create("alienvault")).discover("https://user@www.example.com:8080/docs?q=1");

    const requestUrl = String(fetch.mock.calls[0]?.[0] as string);
    expect(requestUrl).toContain("/domain/www.example.com/url_list");
    expect(requestUrl).not.toContain("8080");
  });

  it("rejects an unparseable domain without sending a request", async () => {
    const fetch = stubJSON({ has_next: false, url_list: [] });

    await expect((await create("alienvault")).discover("foo bar")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubJSON(PAGE_ONE);

    await expect((await create("alienvault")).discover("   ")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes 429 responses to RateLimitError", async () => {
    stubJSON({ error: "rate limited" }, 429);

    await expect((await create("alienvault")).discover("example.com")).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});
