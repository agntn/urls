import { afterEach, describe, expect, it, vi } from "vitest";
import { getJSON, getTextLines } from "../../src/core/client.ts";
import { HTTPError } from "../../src/core/errors.ts";
import { stubHanging } from "../helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getJSON", () => {
  it("rejects with the caller's reason once the signal aborts", async () => {
    stubHanging();
    const controller = new AbortController();

    const pending = getJSON("https://example.com/api", { signal: controller.signal });
    controller.abort(new Error("caller stopped"));

    await expect(pending).rejects.toThrow("caller stopped");
  });

  it("keeps the request timeout when the caller's signal never fires", async () => {
    stubHanging();
    const idle = new AbortController();

    await expect(
      getJSON("https://example.com/api", { signal: idle.signal, timeout: 20 }),
    ).rejects.toBeInstanceOf(HTTPError);
  });
});

describe("getTextLines", () => {
  it("rejects with the caller's reason once the signal aborts", async () => {
    stubHanging();
    const controller = new AbortController();

    const pending = getTextLines("https://example.com/cdx", { signal: controller.signal }).next();
    controller.abort(new Error("caller stopped"));

    await expect(pending).rejects.toThrow("caller stopped");
  });
});
