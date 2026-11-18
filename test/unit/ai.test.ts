import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverTool, providersTool, urlsAiTools } from "../../src/ai.ts";
import { urlsTools } from "../../src/tools.ts";
import { stubHanging, stubJSON } from "../helpers.ts";

const call = { toolCallId: "test", messages: [], context: {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls AI SDK tools", () => {
  it("offers every tool the other hosts list, under the same name", () => {
    expect(Object.keys(urlsAiTools)).toEqual(urlsTools.map((tool) => tool.name));
    expect(urlsAiTools.urls_discover).toBe(discoverTool);
    expect(urlsAiTools.urls_providers).toBe(providersTool);
  });

  it("discover returns the selected source with its count", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    const result = await discoverTool.execute?.(
      { domain: "example.com", provider: "alienvault" },
      call,
    );

    expect(result).toMatchObject({ provider: "alienvault", count: 1, limit: 100, hasMore: false });
    expect(result).toHaveProperty("urls.0.url", "https://example.com/a");
    expect(result).not.toHaveProperty("urls.0.reference");
    expect(result).toHaveProperty(
      "text",
      '[alienvault] 1 URLs for "example.com"\n  https://example.com/a',
    );
  });

  it("discover flags a page cut at the limit", async () => {
    stubJSON({
      has_next: false,
      url_list: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
    });

    const result = await discoverTool.execute?.(
      { domain: "example.com", provider: "alienvault", limit: 1 },
      call,
    );

    expect(result).toMatchObject({ count: 1, limit: 1, hasMore: true });
  });

  it("discover forwards abortSignal to the request", async () => {
    stubHanging();
    const controller = new AbortController();

    const pending = discoverTool.execute?.(
      { domain: "example.com", provider: "alienvault" },
      { ...call, abortSignal: controller.signal },
    );
    controller.abort(new Error("caller stopped"));

    await expect(pending).rejects.toThrow("caller stopped");
  });

  it("providers answers with the listings beside the table", async () => {
    const result = await providersTool.execute?.({}, call);

    expect(result).toHaveProperty("providers.0.name", "alienvault");
    expect(result).toHaveProperty("text", expect.stringMatching(/^Registered providers \(7\):/));
  });
});
