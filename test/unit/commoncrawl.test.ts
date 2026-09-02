import { afterEach, describe, expect, it, vi } from "vitest";

import { create } from "../../src/core/registry.ts";
import { stubJSON } from "../helpers.ts";
import "../../src/providers/commoncrawl.ts";

/**
 * The index contract is taken from Common Crawl's documented collinfo shape; the development
 * network could not reach index.commoncrawl.org during the 2026-09-02 audit (connection
 * refused), so no live capture was possible. The CDX text line shape matches Common Crawl's
 * CDX text output.
 */
const COLLINFO = [
  { id: "CC-MAIN-2025-30", "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2025-30-index" },
  { id: "CC-MAIN-2024-10", "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2024-10-index" },
  { id: "CC-MAIN-2026-30", "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2026-30-index" },
];

const CDX_BODY = ["https://example.com/page1", "https://sub.example.com/page2\n"].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commoncrawl provider", () => {
  it("serves discover", () => {
    expect(create("commoncrawl").capabilities).toEqual({ discover: true });
  });

  it("queries the newest index per year and continues past failing years", async () => {
    const fetch = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes("collinfo.json")) {
        return new Response(JSON.stringify(COLLINFO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // 2025 index answers, 2026 and 2024 fail
      if (url.includes("CC-MAIN-2025")) {
        return new Response(CDX_BODY, { status: 200 });
      }
      return new Response("boom", { status: 502 });
    });
    vi.stubGlobal("fetch", fetch);

    const urls = await create("commoncrawl").discover("example.com");

    const requested = fetch.mock.calls.map((call) => String(call[0] as string));
    expect(requested.filter((url) => url.includes("collinfo.json"))).toHaveLength(1);
    expect(requested.some((url: string) => decodeURIComponent(url).includes("*.example.com"))).toBe(
      true,
    );
    // Only the 2025 index contributed URLs; the 2026 failure was skipped.
    expect(urls.map((url) => url.url)).toEqual([
      "https://example.com/page1",
      "https://sub.example.com/page2",
    ]);
  });

  it("queries exactly one index per year", async () => {
    const fetch = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes("collinfo.json")) {
        return new Response(JSON.stringify(COLLINFO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("CC-MAIN-2026") || url.includes("CC-MAIN-2025")) {
        return new Response(CDX_BODY, { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);

    await create("commoncrawl").discover("example.com");

    const requests = fetch.mock.calls.map((call) => String(call[0] as string));
    expect(requests.filter((url) => url.includes("index?url="))).toHaveLength(3); // one per year
  });

  it("propagates a non-skippable collinfo transport failure", async () => {
    stubJSON({ error: "unreachable" }, 0);

    await expect(create("commoncrawl").discover("example.com")).rejects.toMatchObject({
      name: "HTTPError",
    });
  });

  it("rejects an empty domain without any request", async () => {
    const fetch = stubJSON({});
    fetch.mockRejectedValueOnce(new Error("should not be called"));

    await expect(create("commoncrawl").discover("   ")).rejects.toMatchObject({
      name: "InvalidInputError",
    });
  });
});
