import { afterEach, describe, expect, it, vi } from "vitest";
import { create } from "../../src/core/registry.ts";
import type { ProviderConfig } from "../../src/core/types.ts";
import { stubHanging } from "../helpers.ts";

/** Every built-in source with the config it needs to send its first request. */
const SOURCES: readonly (readonly [string, ProviderConfig])[] = [
  ["alienvault", {}],
  ["arquivo", {}],
  ["commoncrawl", {}],
  ["urlscan", {}],
  ["vefsafn", {}],
  ["virustotal", { apiKey: "test-key" }],
  ["wayback", {}],
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discover cancellation", () => {
  it.each(SOURCES)("%s aborts its request with the caller's reason", async (name, config) => {
    const fetch = stubHanging();
    const provider = await create(name, config);
    const controller = new AbortController();

    const pending = provider.discover("example.com", { signal: controller.signal });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    controller.abort(new Error("caller stopped"));

    await expect(pending).rejects.toThrow("caller stopped");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
