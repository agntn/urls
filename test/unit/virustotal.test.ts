import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../../src/core/errors.ts";
import { create } from "../../src/core/registry.ts";
import { stubJSON } from "../helpers.ts";
import "../../src/providers/virustotal.ts";

/**
 * VirusTotal v3 response shape per the documented `domains/{domain}/urls` contract. The
 * development environment has no VIRUSTOTAL_API_KEY, and the legacy v2 endpoint answers 403
 * HTML, so the fixture follows the API reference instead of a live capture.
 */
const PAGE_ONE = {
  data: [
    {
      type: "url",
      id: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      attributes: { url: "https://example.com/report" },
      links: { self: "https://www.virustotal.com/api/v3/urls/e3b0..." },
    },
    {
      type: "url",
      id: "deadbeef",
      attributes: { url: "https://offsite.test/collect" },
    },
  ],
  links: {
    next: "https://www.virustotal.com/api/v3/domains/example.com/urls?cursor=abc",
  },
};

const PAGE_TWO = {
  data: [{ type: "url", id: "cafe", attributes: { url: "https://example.com/extra" } }],
  links: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("virustotal provider", () => {
  it("serves discover", async () => {
    expect((await create("virustotal", { apiKey: "key" })).capabilities).toEqual({
      discover: true,
    });
  });

  it("requires a key", async () => {
    await expect(create("virustotal")).rejects.toThrow(AuthError);
    await expect(create("virustotal")).rejects.toThrow(/VIRUSTOTAL_API_KEY/);
  });

  it("paginates through links.next and tags source and input", async () => {
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

    const urls = await (await create("virustotal", { apiKey: "key" })).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual([
      "https://example.com/report",
      "https://example.com/extra",
    ]);
    expect(urls[0]).toMatchObject({ source: "virustotal", input: "example.com" });

    const first = String(fetch.mock.calls[0]?.[0]);
    expect(first).toBe("https://www.virustotal.com/api/v3/domains/example.com/urls");
    const second = String(fetch.mock.calls[1]?.[0]);
    expect(second).toBe("https://www.virustotal.com/api/v3/domains/example.com/urls?cursor=abc");
  });

  it("reports the page safeguard when links.next survives fifty pages", async () => {
    let page = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        page += 1;
        return new Response(
          JSON.stringify({
            data: [{ attributes: { url: `https://example.com/${page}` } }],
            links: {
              next: `https://www.virustotal.com/api/v3/domains/example.com/urls?cursor=${page}`,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const onTruncated = vi.fn();

    const urls = await (
      await create("virustotal", { apiKey: "key" })
    ).discover("example.com", {
      onTruncated,
    });

    expect(urls).toHaveLength(50);
    expect(onTruncated).toHaveBeenCalledExactlyOnceWith("virustotal");
  });

  it("does not follow an off-origin links.next with the API key", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ attributes: { url: "https://example.com/report" } }],
            links: { next: "https://evil.test/steal" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const onTruncated = vi.fn();

    const urls = await (
      await create("virustotal", { apiKey: "secret-key" })
    ).discover("example.com", { onTruncated });

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/report"]);
    expect(onTruncated).toHaveBeenCalledExactlyOnceWith("virustotal");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://www.virustotal.com/api/v3/domains/example.com/urls",
    );
  });

  it("sends the key in the x-apikey header, not the URL", async () => {
    const fetch = stubJSON({ data: [], links: {} });

    await (await create("virustotal", { apiKey: "secret-key" })).discover("example.com");

    const call = fetch.mock.calls[0];
    expect(String(call?.[0] as string)).not.toContain("secret-key");
    const init = call?.[1] as RequestInit;
    expect(new Headers(init?.headers).get("x-apikey")).toBe("secret-key");
  });

  it("drops out-of-scope URLs", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PAGE_ONE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [], links: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const urls = await (await create("virustotal", { apiKey: "key" })).discover("example.com");

    expect(urls.map((url) => url.url)).toEqual(["https://example.com/report"]);
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubJSON({});

    await expect(
      (await create("virustotal", { apiKey: "key" })).discover("   "),
    ).rejects.toMatchObject({
      name: "InvalidInputError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
