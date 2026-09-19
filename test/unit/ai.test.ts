import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverTool } from "../../src/ai.ts";
import { stubHanging, stubJSON } from "../helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls AI SDK tools", () => {
  it("discover returns the selected source with its count", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    const result = await discoverTool.execute?.(
      { domain: "example.com", provider: "alienvault" },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toMatchObject({ provider: "alienvault", count: 1, limit: 100, hasMore: false });
    expect(result).toHaveProperty("urls.0.url", "https://example.com/a");
    expect(result).not.toHaveProperty("urls.0.reference");
  });

  it("discover flags a page cut at the limit", async () => {
    stubJSON({
      has_next: false,
      url_list: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
    });

    const result = await discoverTool.execute?.(
      { domain: "example.com", provider: "alienvault", limit: 1 },
      { toolCallId: "test", messages: [] },
    );

    expect(result).toMatchObject({ count: 1, limit: 1, hasMore: true });
  });

  it("discover forwards abortSignal to the request", async () => {
    stubHanging();
    const controller = new AbortController();

    const pending = discoverTool.execute?.(
      { domain: "example.com", provider: "alienvault" },
      { toolCallId: "test", messages: [], abortSignal: controller.signal },
    );
    controller.abort(new Error("caller stopped"));

    await expect(pending).rejects.toThrow("caller stopped");
  });
});
