import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import { requireTool, stubJSON } from "../helpers.ts";
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

  it("lists providers without model or network access", async () => {
    const tool = requireTool(registerExtensionTools(), "urls_providers");

    const result = await tool.execute("test", {}, undefined, undefined, unusedContext);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^Registered providers \(5\):/);
    expect(text).toContain("alienvault");
    expect(text).toContain("virustotal");
  });
});
