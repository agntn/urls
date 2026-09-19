import { afterEach, describe, expect, it, vi } from "vitest";
import { runDiscover, runDiscoverPage } from "../../src/tool-operations.ts";
import { DEFAULT_DISCOVER_LIMIT, MAX_DISCOVER_RESULTS } from "../../src/core/types.ts";
import "../../src/providers/index.ts";
import { stubJSON } from "../helpers.ts";

const PAGE = { has_next: false, url_list: [{ url: "https://example.com/a" }] };

/**
 * One AlienVault page holding `count` distinct URLs.
 *
 * @param count URLs on the page.
 * @returns {object} The page body.
 */
function pageOf(count: number) {
  return {
    has_next: false,
    url_list: Array.from({ length: count }, (_, index) => ({
      url: `https://example.com/${index}`,
    })),
  };
}

function stubDiscovery() {
  const fetch = vi.fn(
    async (_input: string) =>
      new Response(JSON.stringify(PAGE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VIRUSTOTAL_API_KEY;
});

describe("runDiscover", () => {
  it("returns one provider's results for an explicit source", async () => {
    stubDiscovery();

    const outcome = await runDiscover("example.com", undefined, "alienvault");

    expect(outcome).toMatchObject({ mode: "single", provider: "alienvault" });
    if (outcome.mode === "single") {
      expect(outcome.urls[0]).toMatchObject({ url: "https://example.com/a", source: "alienvault" });
      expect(outcome.urls).toHaveLength(1);
    }
  });

  it("falls back to the auto-selected source when no provider is given", async () => {
    stubDiscovery();

    const outcome = await runDiscover("example.com", { limit: 1 });

    expect(outcome.mode).toBe("single");
    if (outcome.mode === "single") expect(outcome.provider).toBe("alienvault");
  });

  it("fans out to every source for provider 'all'", async () => {
    stubDiscovery();

    const outcome = await runDiscover("example.com", undefined, "all");

    expect(outcome.mode).toBe("comparison");
    if (outcome.mode === "comparison") {
      const providers = outcome.outcomes.map((entry) => entry.provider);
      expect(providers).toEqual([
        "alienvault",
        "arquivo",
        "commoncrawl",
        "urlscan",
        "vefsafn",
        "virustotal",
        "wayback",
      ]);
      const alienvault = outcome.outcomes.find((entry) => entry.provider === "alienvault");
      expect(alienvault?.result?.[0]?.url).toBe("https://example.com/a");
    }
  });

  it("reports per-source errors in the comparison without failing the request", async () => {
    stubDiscovery();

    const outcome = await runDiscover("example.com", undefined, "all");

    expect(outcome.mode).toBe("comparison");
    if (outcome.mode === "comparison") {
      const virustotal = outcome.outcomes.find((entry) => entry.provider === "virustotal");
      expect(virustotal?.error?.message).toContain("VIRUSTOTAL_API_KEY");
    }
  });
});

describe("runDiscoverPage", () => {
  it("bounds an unbounded call at the default limit and says the source had more", async () => {
    stubJSON(pageOf(DEFAULT_DISCOVER_LIMIT + 5));

    const outcome = await runDiscoverPage("example.com", undefined, "alienvault");

    expect(outcome.mode).toBe("single");
    if (outcome.mode === "single") {
      expect(outcome.page).toMatchObject({
        count: DEFAULT_DISCOVER_LIMIT,
        limit: DEFAULT_DISCOVER_LIMIT,
        hasMore: true,
      });
      expect(outcome.page.urls).toHaveLength(DEFAULT_DISCOVER_LIMIT);
    }
  });

  it("reports no overflow when the source stops exactly at the limit", async () => {
    stubJSON(pageOf(2));

    const outcome = await runDiscoverPage("example.com", { limit: 2 }, "alienvault");

    expect(outcome.mode).toBe("single");
    if (outcome.mode === "single") {
      expect(outcome.page).toMatchObject({ count: 2, limit: 2, hasMore: false });
    }
  });

  it("asks the source for one URL past the limit and keeps the page at the limit", async () => {
    stubJSON(pageOf(3));

    const outcome = await runDiscoverPage("example.com", { limit: 1 }, "alienvault");

    expect(outcome.mode).toBe("single");
    if (outcome.mode === "single") {
      expect(outcome.page).toMatchObject({ count: 1, limit: 1, hasMore: true, truncated: false });
      expect(outcome.page.urls.map((url) => url.url)).toEqual(["https://example.com/0"]);
    }
  });

  it("reports more for a full page at the published bound, where it cannot look past", async () => {
    stubJSON(pageOf(MAX_DISCOVER_RESULTS));

    const outcome = await runDiscoverPage(
      "example.com",
      { limit: MAX_DISCOVER_RESULTS },
      "alienvault",
    );

    expect(outcome.mode).toBe("single");
    if (outcome.mode === "single") {
      expect(outcome.page).toMatchObject({
        count: MAX_DISCOVER_RESULTS,
        limit: MAX_DISCOVER_RESULTS,
        hasMore: true,
      });
    }
  });

  it("reports more when the source stopped at its page safeguard with pages left", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string) =>
          new Response(
            JSON.stringify({
              has_next: true,
              url_list: [{ url: `https://example.com/${new URL(input).searchParams.get("page")}` }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const outcome = await runDiscoverPage("example.com", { limit: 300 }, "alienvault");

    expect(outcome.mode).toBe("single");
    if (outcome.mode === "single") {
      expect(outcome.page).toMatchObject({ count: 20, limit: 300, hasMore: true, truncated: true });
    }
  });

  it("drops the query URL from every record unless reference is requested", async () => {
    stubJSON(PAGE);

    const trimmed = await runDiscoverPage("example.com", undefined, "alienvault");
    const kept = await runDiscoverPage("example.com", { reference: true }, "alienvault");

    if (trimmed.mode === "single") {
      expect(trimmed.page.urls[0]).toEqual({
        url: "https://example.com/a",
        source: "alienvault",
        input: "example.com",
      });
    }
    if (kept.mode === "single") {
      expect(kept.page.urls[0]?.reference).toContain("otx.alienvault.com");
    }
    expect.assertions(2);
  });

  it("pages every source in the comparison and keeps the failures", async () => {
    stubJSON(pageOf(2));

    const outcome = await runDiscoverPage("example.com", { limit: 1 }, "all");

    expect(outcome.mode).toBe("comparison");
    if (outcome.mode === "comparison") {
      const alienvault = outcome.outcomes.find((entry) => entry.provider === "alienvault");
      expect(alienvault?.result).toMatchObject({ count: 1, limit: 1, hasMore: true });
      const virustotal = outcome.outcomes.find((entry) => entry.provider === "virustotal");
      expect(virustotal?.error?.message).toContain("VIRUSTOTAL_API_KEY");
    }
  });
});
