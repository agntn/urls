import * as TypeBox from "@oh-my-pi/omptype/typebox";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import type { Theme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Only the root module is injected by the host; the TUI barrel must stay off the load path. */
vi.mock("@oh-my-pi/pi-coding-agent", () => ({
  Text: class {
    constructor(
      readonly text: string,
      readonly paddingX?: number,
      readonly paddingY?: number,
    ) {}

    render(): string[] {
      return [this.text];
    }
  },
}));
vi.mock("@oh-my-pi/pi-coding-agent/tui", () => {
  throw new Error("The OMP host does not inject the TUI barrel");
});

import { requireTool, stubHanging, stubJSON } from "../helpers.ts";
import { DEFAULT_DISCOVER_LIMIT } from "../../src/core/types.ts";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls OMP extension", () => {
  it("registers the complete read-only tool set under an extension label", () => {
    const { label, tools } = registerExtensionTools();

    expect(label).toBe("Urls");
    expect([...tools.keys()]).toEqual(["urls_discover", "urls_providers"]);
    for (const tool of tools.values()) expect(tool.approval).toBe("read");
  });

  it.each([
    [false, undefined, "success:status.done"],
    [true, undefined, "muted:status.pending"],
    [true, 3, "frame-1"],
  ] as const)(
    "renders the host theme for partial=%s, frame=%s",
    (isPartial, spinnerFrame, icon) => {
      const tool = requireTool(registerExtensionTools().tools, "urls_discover");
      const theme = {
        fg: (color: string, text: string) => `${color}(${text})`,
        styledSymbol: (symbol: string, color: string) => `${color}:${symbol}`,
        spinnerFrames: ["frame-0", "frame-1"],
      } as unknown as Theme;
      const escape = String.fromCodePoint(27);
      const component = tool.renderCall?.(
        { domain: `example${escape}[31m\n.com` },
        { expanded: false, isPartial, spinnerFrame },
        theme,
      );

      expect(component?.render(120)).toEqual([
        `${icon} accent(Urls Discover): muted(example .com)`,
      ]);
    },
  );

  it("declares an integer discover limit from 1 through 100000", () => {
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");

    expect(accepts(tool, { domain: "example.com", limit: 1 })).toBe(true);
    expect(accepts(tool, { domain: "example.com", limit: 100000 })).toBe(true);
    expect(accepts(tool, { domain: "example.com", limit: 0 })).toBe(false);
    expect(accepts(tool, { domain: "example.com", limit: 100001 })).toBe(false);
    expect(accepts(tool, { domain: "example.com", limit: 1.5 })).toBe(false);
  });

  it("names the shared default limit in the limit description", () => {
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");
    const schema = (tool.parameters as unknown as TypeBox.TSchema).toJsonSchema() as {
      properties: { limit: { description: string } };
    };

    expect(schema.properties.limit.description).toContain(`Defaults to ${DEFAULT_DISCOVER_LIMIT};`);
    expect(tool.description).toContain(`at most ${DEFAULT_DISCOVER_LIMIT} `);
  });

  it("discover ends with the limit note when the source had more", async () => {
    stubJSON({
      has_next: false,
      url_list: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
    });
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");

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

  it("discover forwards the host's abort signal to the request", async () => {
    stubHanging();
    const tool = requireTool(registerExtensionTools().tools, "urls_discover");
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
    const tool = requireTool(registerExtensionTools().tools, "urls_providers");

    const result = await tool.execute("test", {}, undefined, undefined, unusedContext);

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/^Registered providers \(7\):/);
  });
});
