import { afterEach, describe, expect, it, vi } from "vitest";
import { runDiscover } from "../../src/tool-operations.ts";
import "../../src/providers/index.ts";

const PAGE = { has_next: false, url_list: [{ url: "https://example.com/a" }] };

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
