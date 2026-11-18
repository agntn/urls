import { ToolInputError, wireSchema } from "@agntn/tools";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Compiled OMP gives an extension only the package root, so loading the TUI barrel has to fail. */
vi.mock("@oh-my-pi/pi-coding-agent/tui", () => {
  throw new Error("The OMP host does not inject the TUI barrel");
});

import { requireTool, stubHanging, stubJSON } from "../helpers.ts";
import { DEFAULT_DISCOVER_LIMIT } from "../../src/core/types.ts";
import { urlsTools } from "../../src/tools.ts";
import urlsOmpExtension from "../../extensions/omp/urls.ts";

/* Stands in for the host `Text`, keeping the drawn line for the assertion. */
class CapturedText {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

/* The host build wraps the JSON Schema in `Type.Unsafe` and emits it verbatim. */
const hostTypebox = {
  Type: { Unsafe: (schema: unknown) => schema },
} as unknown as ExtensionAPI["typebox"];

/* A host double that throws on any member the extension was not expected to read. */
function strictDouble<T extends object>(name: string, stubs: Partial<T>): T {
  return new Proxy(stubs, {
    get(target, key, receiver) {
      if (typeof key === "symbol" || key === "then" || Reflect.has(target, key)) {
        const member: unknown = Reflect.get(target, key, receiver);
        return member;
      }
      throw new Error(`${name}.${String(key)} is not stubbed in the OMP test host`);
    },
  }) as T;
}

interface RegisteredExtension {
  labels: string[];
  tools: Map<string, ToolDefinition>;
}

async function registerExtensionTools(): Promise<RegisteredExtension> {
  const tools = new Map<string, ToolDefinition>();
  const labels: string[] = [];
  await urlsOmpExtension(
    strictDouble<ExtensionAPI>("ExtensionAPI", {
      typebox: hostTypebox,
      pi: strictDouble<ExtensionAPI["pi"]>("ExtensionAPI.pi", {
        Text: CapturedText as unknown as ExtensionAPI["pi"]["Text"],
      }),
      setLabel(label) {
        labels.push(label);
      },
      registerTool(tool) {
        tools.set(tool.name, tool as ToolDefinition);
      },
    }),
  );
  return { labels, tools };
}

/* Writes its styling calls into the output, so a test sees what went where. */
const theme = strictDouble<Theme>("Theme", {
  fg: (color, text) => `${color}(${text})`,
  styledSymbol: (symbol, color) => `${color}:${symbol}`,
  spinnerFrames: ["frame-0", "frame-1"],
  format: strictDouble<Theme["format"]>("Theme.format", { bracketLeft: "[", bracketRight: "]" }),
  sep: strictDouble<Theme["sep"]>("Theme.sep", { dot: " | " }),
});

/* What `hostContext` in `@agntn/tools` reads off OMP's `ctx`, for a host without a UI. */
const context = strictDouble<ExtensionContext>("ExtensionContext", {
  hasUI: false,
  ui: undefined,
});

async function run(name: string, params: unknown, signal?: AbortSignal) {
  const tool = requireTool((await registerExtensionTools()).tools, name);
  return tool.execute("test", params as never, signal, undefined, context);
}

async function text(name: string, params: unknown): Promise<string> {
  return ((await run(name, params)).content[0] as { text: string }).text;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urls OMP extension", () => {
  it("registers the complete read-only tool set under an extension label", async () => {
    const { labels, tools } = await registerExtensionTools();

    expect(labels).toEqual(["Urls"]);
    expect([...tools.keys()]).toEqual(["urls_providers", "urls_discover"]);
    for (const definition of urlsTools) {
      const tool = requireTool(tools, definition.name);
      expect(tool.approval).toBe("read");
      expect(tool.label).toBe(definition.title);
      expect(tool.parameters).toEqual(wireSchema(definition));
    }
  });

  it.each([
    [false, undefined, "success:status.done"],
    [true, undefined, "muted:status.pending"],
    [true, 3, "frame-1"],
  ] as const)(
    "renders the host theme for partial=%s, frame=%s",
    async (isPartial, spinnerFrame, icon) => {
      const tool = requireTool((await registerExtensionTools()).tools, "urls_discover");
      const escape = String.fromCodePoint(27);
      const drawn = tool.renderCall?.(
        { domain: `example${escape}[31m\n.com` } as never,
        { expanded: false, isPartial, spinnerFrame },
        theme,
      );

      expect((drawn as unknown as CapturedText).text).toBe(
        `${icon} accent(Discover URLs): muted(example .com)`,
      );
    },
  );

  it("draws the providers call on the status line", async () => {
    const tool = requireTool((await registerExtensionTools()).tools, "urls_providers");
    const drawn = tool.renderCall?.({} as never, { expanded: false, isPartial: false }, theme);

    expect((drawn as unknown as CapturedText).text).toBe(
      "success:status.done accent(List Providers): muted(list)",
    );
  });

  it.each([0, 100001, 1.5])("refuses discover limit %s in the core", async (limit) => {
    await expect(run("urls_discover", { domain: "example.com", limit })).rejects.toThrow(
      ToolInputError,
    );
  });

  it("names the shared default limit in the limit description", async () => {
    const tool = requireTool((await registerExtensionTools()).tools, "urls_discover");
    const { limit } = (tool.parameters as { properties: { limit: { description: string } } })
      .properties;

    expect(limit.description).toContain(`Defaults to ${DEFAULT_DISCOVER_LIMIT};`);
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
    await expect(run("urls_discover", {})).rejects.toThrow(ToolInputError);
    await expect(run("urls_discover", { domain: "" })).rejects.toThrow("/domain");
  });

  it("discover executes through the library with the selected source", async () => {
    stubJSON({ has_next: false, url_list: [{ url: "https://example.com/a" }] });

    await expect(
      text("urls_discover", { domain: "example.com", provider: "alienvault" }),
    ).resolves.toBe('[alienvault] 1 URLs for "example.com"\n  https://example.com/a');
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
    await expect(text("urls_providers", {})).resolves.toMatch(/^Registered providers \(7\):/);
  });
});
