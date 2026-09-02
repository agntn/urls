import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverAll, discoverWithFallback } from "../../src/core/all.ts";
import "../../src/providers/index.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VIRUSTOTAL_API_KEY;
  delete process.env.URLSCAN_API_KEY;
});

describe("discoverAll", () => {
  it("fans out to every source and reports per-source outcomes", async () => {
    const fetch = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes("url_list")) {
        return new Response(
          JSON.stringify({ has_next: false, url_list: [{ url: "https://example.com/a" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("cdx/search/cdx")) {
        return new Response("https://example.com/b\n", { status: 200 });
      }
      if (url.includes("search/?q=") || url.includes("search/?")) {
        return new Response(JSON.stringify({ has_more: false, results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const outcomes = await discoverAll("example.com");

    const names = outcomes.map((outcome) => outcome.provider);
    expect(names).toEqual([
      "alienvault",
      "arquivo",
      "commoncrawl",
      "urlscan",
      "virustotal",
      "wayback",
    ]);

    const alienvault = outcomes.find((outcome) => outcome.provider === "alienvault");
    expect(alienvault).toMatchObject({ result: [{ url: "https://example.com/a" }] });

    const virustotal = outcomes.find((outcome) => outcome.provider === "virustotal");
    expect(virustotal?.error?.message).toContain("VIRUSTOTAL_API_KEY");
  });
});

describe("discoverWithFallback", () => {
  it("selects the keyless default and returns its URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ has_next: false, url_list: [{ url: "https://example.com/a" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const fallback = await discoverWithFallback("example.com", { limit: 1 });

    expect(fallback.provider).toBe("alienvault");
    expect(fallback.result).toHaveLength(1);
  });

  it("falls past key-gated providers when the backend rejects the key", async () => {
    // virustotal key set → resolver picks it first; a 401 from the backend is skippable, so
    // the fallback should land on the keyless alienvault source.
    process.env.VIRUSTOTAL_API_KEY = "dummy";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes("virustotal.com")) {
          return new Response(
            JSON.stringify({ error: { code: "WrongCredentialsError", message: "Wrong API key" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ has_next: false, url_list: [{ url: "https://example.com/a" }] }),
          { status: 200 },
        );
      }),
    );

    const fallback = await discoverWithFallback("example.com");

    expect(fallback.provider).toBe("alienvault");
  });

  it("propagates non-skippable failures from the selected provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("internal error", { status: 500 })),
    );

    await expect(discoverWithFallback("example.com")).rejects.toMatchObject({
      name: "HTTPError",
    });
  });
});
