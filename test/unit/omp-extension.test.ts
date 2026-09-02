import * as TypeBox from "@oh-my-pi/omptype/typebox";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

/**
 * The host serves these modules to loaded extensions at runtime; under vitest the renderers are
 * exercised against capturing stand-ins instead of the OMP TUI.
 */
vi.mock("@oh-my-pi/pi-coding-agent", () => ({
  Text: class {
    constructor(
      readonly text: string,
      readonly paddingX?: number,
      readonly paddingY?: number,
    ) {}
  },
}));
vi.mock("@oh-my-pi/pi-coding-agent/tui", () => ({
  renderStatusLine: (options: unknown) => JSON.stringify(options),
}));

import { requireTool, stubJSON } from "../helpers.ts";
import urlsOmpExtension from "../../packages/omp/extensions/urls.ts";

interface RegisteredExtension {
  label: string | undefined;
  tools: Map<string, ToolDefinition>;
}

/**
 * Register the extension's tools against a capturing fake host.
 *
 * @returns {RegisteredExtension} The host label and registered tools by name.
 */
function registerExtensionTools(): RegisteredExtension {
  const tools = new Map<string, ToolDefinition>();
  let label: string | undefined;
  const api = {
    typebox: TypeBox,
    setLabel(value: string) {
      label = value;
    },
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
  };

  urlsOmpExtension(api as unknown as ExtensionAPI);
  return { label, tools };
}

/**
 * Validate a value against an OMP-host schema.
 *
 * @param tool Registered tool definition.
 * @param value Candidate arguments.
 * @returns {boolean} True when the schema accepts the value.
 */
function accepts(tool: ToolDefinition, value: unknown): boolean {
  return (tool.parameters as unknown as TypeBox.TSchema).safeParse(value).success;
}

/** SAFETY: the tested execute functions do not read ExtensionContext. */
const unusedContext = {} as ExtensionContext;

describe("urls OMP extension", () => {
  it("registers the complete read-only tool set under an extension label", () => {
    const { label, tools } = registerExtensionTools();

    expect(label).toBe("Urls");
    expect([...tools.keys()]).toEqual(["urls_discover", "urls_providers"]);
    for (const tool of tools.values()) expect(tool.approval).toBe("read");
  });

  it("declares an integer discover limit from 1 through 100000", () => {
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");

    expect(accepts(tool, { domain: "example.com", limit: 1 })).toBe(true);
    expect(accepts(tool, { domain: "example.com", limit: 100000 })).toBe(true);
    expect(accepts(tool, { domain: "example.com", limit: 0 })).toBe(false);
    expect(accepts(tool, { domain: "example.com", limit: 100001 })).toBe(false);
    expect(accepts(tool, { domain: "example.com", limit: 1.5 })).toBe(false);
  });

  it("requires a non-empty domain", () => {
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");

    expect(accepts(tool, { domain: "example.com" })).toBe(true);
    expect(accepts(tool, {})).toBe(false);
    expect(accepts(tool, { domain: "" })).toBe(false);
  });

  it("discover executes through the library with the selected source", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");

    const result = await tool.execute(
      "test",
      { domain: "example.com", provider: "alienvault" },
      undefined,
      undefined,
      unusedContext,
    );

    expect(result.content).toEqual([{ type: "text", text: "https://example.com/a" }]);
  });

  it("lists providers without model or network access", async () => {
    const tool = requireTool(registerExtensionTools().tools, "urls_providers");

    const result = await tool.execute("test", {}, undefined, undefined, unusedContext);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^Registered providers \(7\):/);
  });
});
