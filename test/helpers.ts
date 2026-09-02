import { vi } from "vitest";

/**
 * Look up a registered extension tool, failing loudly when registration missed it.
 *
 * @param tools Extension tool registry.
 * @param name Registered tool name.
 * @returns {T} The registered tool definition.
 */
export function requireTool<T>(tools: ReadonlyMap<string, T>, name: string): T {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

/**
 * Stub global fetch with one JSON body.
 *
 * @param body JSON-serializable response body.
 * @param status HTTP status for the response.
 * @returns {ReturnType<typeof vi.fn>} The mock for call inspection.
 */
export function stubJSON(body: unknown, status = 200) {
  const fetch = vi.fn(
    async (_input: string) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/**
 * Stub global fetch with one raw text body.
 *
 * @param body Text response body.
 * @param status HTTP status for the response.
 * @returns {ReturnType<typeof vi.fn>} The mock for call inspection.
 */
export function stubText(body: string, status = 200) {
  const fetch = vi.fn(
    async (_input: string) =>
      new Response(body, {
        status,
        headers: { "Content-Type": "text/plain" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
