import { wireSchema } from "@agntn/tools";
import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireTool, stubHanging, stubJSON } from "../helpers.ts";
import { DEFAULT_DISCOVER_LIMIT } from "../../src/core/types.ts";
import { urlsTools } from "../../src/tools.ts";
import urlsExtension from "../../extensions/pi/urls.ts";

/* SAFETY: the adapter only calls registerTool; reading any other member fails by name. */
async function registerExtensionTools(): Promise<Map<string, ToolDefinition>> {
  const tools = new Map<string, ToolDefinition>();
  const api = new Proxy(
    {
      registerTool(tool: ToolDefinition) {
        tools.set(tool.name, tool);
      },
    },
    {
      get(target, key, receiver) {
        if (typeof key === "symbol" || key === "then" || Reflect.has(target, key)) {
          const member: unknown = Reflect.get(target, key, receiver);
          return member;
        }
        throw new Error(`ExtensionAPI.${String(key)} is not stubbed`);
      },
    },
  );

  await urlsExtension(api as unknown as ExtensionAPI);
  return tools;
}

/* What `hostContext` in `@agntn/tools` reads off Pi's `ctx`, for a host without a UI. */
const context = { hasUI: false, ui: undefined } as unknown as ExtensionToolContext;

async function run(name: string, params: unknown, signal?: AbortSignal) {
  const tool = requireTool(await registerExtensionTools(), name);
  return tool.execute("test", params as never, signal, undefined, context);
}

async function text(name: string, params: unknown): Promise<string> {
  return ((await run(name, params)).content[0] as { text: string }).text;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls Pi extension", () => {
  it("registers the complete tool set with the shared schemas", async () => {
    const tools = await registerExtensionTools();

    expect([...tools.keys()]).toEqual(["urls_providers", "urls_discover"]);
    for (const definition of urlsTools) {
      expect(requireTool(tools, definition.name).parameters).toEqual(wireSchema(definition));
    }
  });

  it("names each tool in every prompt guideline", async () => {
    const tools = await registerExtensionTools();

    for (const tool of tools.values()) {
      expect(tool.promptGuidelines).not.toHaveLength(0);
      for (const guideline of tool.promptGuidelines ?? []) {
        expect(guideline).toContain(tool.name);
      }
    }
  });

  it.each([0, 100001, 1.5])("refuses discover limit %s before any request", async (limit) => {
    const fetch = stubJSON({ has_next: false, url_list: [] });

    await expect(run("urls_discover", { domain: "example.com", limit })).rejects.toThrow("/limit");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([1, 100000])("takes discover limit %s", async (limit) => {
    stubJSON({ has_next: false, url_list: [] });

    await expect(
      text("urls_discover", { domain: "example.com", provider: "alienvault", limit }),
    ).resolves.toBe('[alienvault] 0 URLs for "example.com"');
  });

  it("names the shared default limit in the limit description", async () => {
    const tool = requireTool(await registerExtensionTools(), "urls_discover");
    const { limit } = (tool.parameters as { properties: { limit: { description: string } } })
      .properties;

    expect(limit.description).toContain(`Defaults to ${DEFAULT_DISCOVER_LIMIT};`);
    expect(tool.promptGuidelines?.join("\n")).toContain(`at most ${DEFAULT_DISCOVER_LIMIT} `);
    expect(tool.description).toContain(`at most ${DEFAULT_DISCOVER_LIMIT} `);
  });

  it("discover says on its first line when the source had more", async () => {
    stubJSON({
      has_next: false,
      url_list: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
    });

    await expect(
      text("urls_discover", { domain: "example.com", provider: "alienvault", limit: 1 }),
    ).resolves.toBe(
      '[alienvault] 1 URLs for "example.com" (limit 1 reached; raise limit or narrow with match, ext, urlScope)\n  https://example.com/a',
    );
  });

  it("requires a non-empty domain", async () => {
    await expect(run("urls_discover", {})).rejects.toThrow("domain");
    await expect(run("urls_discover", { domain: "" })).rejects.toThrow("/domain");
    await expect(run("urls_discover", { domain: "  " })).rejects.toThrow("/domain");
  });

  it("refuses an argument the schema doesn't declare", async () => {
    await expect(run("urls_discover", { domain: "example.com", lmit: 1 })).rejects.toThrow(
      'unknown property "lmit"',
    );
  });

  it("discover names the source and returns one URL per line", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    const result = await run("urls_discover", { domain: "example.com", provider: "alienvault" });

    expect(result.content).toEqual([
      { type: "text", text: '[alienvault] 1 URLs for "example.com"\n  https://example.com/a' },
    ]);
    expect(result.details).toMatchObject({ provider: "alienvault", count: 1, hasMore: false });
  });

  it("fails the call on an unknown source, since Pi takes a returned value as success", async () => {
    await expect(run("urls_discover", { domain: "example.com", provider: "nope" })).rejects.toThrow(
      "Unknown provider: nope; known providers: alienvault",
    );
  });

  it("discover forwards the host's abort signal to the request", async () => {
    stubHanging();
    const controller = new AbortController();

    const pending = run(
      "urls_discover",
      { domain: "example.com", provider: "alienvault" },
      controller.signal,
    );
    controller.abort(new Error("host stopped"));

    await expect(pending).rejects.toThrow("host stopped");
  });

  it("lists providers without model or network access", async () => {
    const listing = await text("urls_providers", {});

    expect(listing).toMatch(/^Registered providers \(7\):/);
    expect(listing).toContain("alienvault");
    expect(listing).toContain("virustotal");
  });
});
