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

  it("keeps the caller's reason when the body stream fails with a generic abort", async () => {
    vi.stubGlobal("fetch", vi.fn(stalledAfterFirstLine));
    const controller = new AbortController();
    const lines = getTextLines("https://example.com/cdx", { signal: controller.signal });

    await expect(lines.next()).resolves.toEqual({ done: false, value: "first" });
    const pending = lines.next();
    controller.abort(new Error("caller stopped"));

    await expect(pending).rejects.toThrow("caller stopped");
  });
});

/**
 * Answer with one line, then stall until the request signal aborts and fail the body with a
 * generic abort that carries no caller reason, the way a runtime outside undici might.
 *
 * @param _input Request URL.
 * @param init Request options carrying the composed signal.
 * @returns {Promise<Response>} A streaming response that never completes on its own.
 */
async function stalledAfterFirstLine(_input: string, init?: RequestInit): Promise<Response> {
  const signal = init?.signal;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("first\n"));
      signal?.addEventListener(
        "abort",
        () => controller.error(new DOMException("The operation was aborted", "AbortError")),
        { once: true },
      );
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } });
}
