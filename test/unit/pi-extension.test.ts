import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import { requireTool, stubHanging, stubJSON } from "../helpers.ts";
import { DEFAULT_DISCOVER_LIMIT } from "../../src/core/types.ts";
import urlsExtension from "../../packages/pi/extensions/urls.ts";

/**
 * Register the extension's tools against a capturing fake host.
 *
 * @returns {Map<string, ToolDefinition>} The registered tools by name.
 */
function registerExtensionTools(): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();
  const api = {
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
  };

  urlsExtension(api as unknown as ExtensionAPI);
  return tools;
}

/** SAFETY: the tested execute functions do not read ExtensionContext. */
const unusedContext = {} as ExtensionContext;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls Pi extension", () => {
  it("registers the complete tool set", () => {
    const tools = registerExtensionTools();

    expect([...tools.keys()]).toEqual(["urls_discover", "urls_providers"]);
  });

  it("names each tool in every prompt guideline", () => {
    const tools = registerExtensionTools();

    for (const tool of tools.values()) {
      expect(tool.promptGuidelines).not.toHaveLength(0);
      for (const guideline of tool.promptGuidelines ?? []) {
        expect(guideline).toContain(tool.name);
      }
    }
  });

  it("declares an integer discover limit from 1 through 100000", () => {
    const tool = requireTool(registerExtensionTools(), "urls_discover");

    expect(Value.Check(tool.parameters, { domain: "example.com", limit: 1 })).toBe(true);
    expect(Value.Check(tool.parameters, { domain: "example.com", limit: 100000 })).toBe(true);
    expect(Value.Check(tool.parameters, { domain: "example.com", limit: 0 })).toBe(false);
    expect(Value.Check(tool.parameters, { domain: "example.com", limit: 100001 })).toBe(false);
    expect(Value.Check(tool.parameters, { domain: "example.com", limit: 1.5 })).toBe(false);
  });

  it("names the shared default limit in the limit description", () => {
    const tool = requireTool(registerExtensionTools(), "urls_discover");
    const limit = (tool.parameters as { properties: { limit: { description: string } } }).properties
      .limit;

    expect(limit.description).toContain(`Defaults to ${DEFAULT_DISCOVER_LIMIT};`);
    expect(tool.promptGuidelines?.join("\n")).toContain(`at most ${DEFAULT_DISCOVER_LIMIT} `);
  });

  it("discover ends with the limit note when the source had more", async () => {
    stubJSON({
      has_next: false,
      url_list: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
    });
    const tool = requireTool(registerExtensionTools(), "urls_discover");

    const result = await tool.execute(
      "test",
      { domain: "example.com", provider: "alienvault", limit: 1 },
      undefined,
      undefined,
      unusedContext,
    );

    expect(result.content).toEqual([
      {
        type: "text",
        text: "https://example.com/a\nlimit 1 reached; raise limit or narrow with match, ext, urlScope",
      },
    ]);
  });

  it("requires a non-empty domain", () => {
    const tool = requireTool(registerExtensionTools(), "urls_discover");

    expect(Value.Check(tool.parameters, { domain: "example.com" })).toBe(true);
    expect(Value.Check(tool.parameters, {})).toBe(false);
    expect(Value.Check(tool.parameters, { domain: "" })).toBe(false);
  });

  it("discover returns one URL per line from the selected source", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });
    const tool = requireTool(registerExtensionTools(), "urls_discover");

    const result = await tool.execute(
      "test",
      { domain: "example.com", provider: "alienvault" },
      undefined,
      undefined,
      unusedContext,
    );

    expect(result.content).toEqual([{ type: "text", text: "https://example.com/a" }]);
  });

  it("discover reports an empty result without network noise", async () => {
    stubJSON({ has_next: false, url_list: [] });
    const tool = requireTool(registerExtensionTools(), "urls_discover");

    const result = await tool.execute(
      "test",
      { domain: "example.com", provider: "alienvault" },
      undefined,
      undefined,
      unusedContext,
    );

    expect(result.content).toEqual([{ type: "text", text: "No URLs found" }]);
  });

  it("discover forwards the host's abort signal to the request", async () => {
    stubHanging();
    const tool = requireTool(registerExtensionTools(), "urls_discover");
    const controller = new AbortController();

    const pending = tool.execute(
      "test",
      { domain: "example.com", provider: "alienvault" },
      controller.signal,
      undefined,
      unusedContext,
    );
    controller.abort(new Error("host stopped"));

    await expect(pending).rejects.toThrow("host stopped");
  });

  it("lists providers without model or network access", async () => {
    const tool = requireTool(registerExtensionTools(), "urls_providers");

    const result = await tool.execute("test", {}, undefined, undefined, unusedContext);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^Registered providers \(7\):/);
    expect(text).toContain("alienvault");
    expect(text).toContain("virustotal");
  });
});
