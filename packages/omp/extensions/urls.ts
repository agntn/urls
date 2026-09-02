/** OMP extension: Urls - unified passive URL discovery tools. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-coding-agent";
import { renderStatusLine } from "@oh-my-pi/pi-coding-agent/tui";

import type * as UrlsModule from "../../../dist/index.d.mts";

const sourceModulePath = fileURLToPath(new URL("../../../src/index.ts", import.meta.url));
let urlsModulePromise: Promise<typeof UrlsModule> | undefined;

/**
 * Load current source in development and fall back to the built package in distributions.
 *
 * Both specifiers stay literal: OMP rewrites bare dependencies only for imports
 * it can see statically. existsSync chooses the branch; it does not build a URL
 * for a single import().
 *
 * @returns {Promise<typeof UrlsModule>} The library module, source in development, built package in distributions.
 */
function loadLibrary(): Promise<typeof UrlsModule> {
  urlsModulePromise ??= existsSync(sourceModulePath)
    ? (import("../../../src/index.ts") as unknown as Promise<typeof UrlsModule>)
    : (import("../../../dist/index.mjs") as Promise<typeof UrlsModule>);

  return urlsModulePromise;
}

/**
 * Renderer interpolations cross the terminal trust boundary: model arguments and external values
 * may carry ANSI/OSC escape sequences or raw C0/C1 control bytes that OMP's Text component passes
 * through to the terminal unchanged. String() first, because hostile JSON is not bound by the
 * declared parameter types.
 *
 * Control bytes are stripped with code points, not a regex class, so `no-control-regex` stays on.
 */
const SPACE_RUNS = / +/g;

/**
 * Replace C0/C1 bytes with spaces, optionally keeping newline.
 *
 * @param text Already-stripped-of-VT text.
 * @param keepNewline Preserve U+000A.
 * @returns {string} Text without other control bytes.
 */
function replaceControlBytes(text: string, keepNewline: boolean): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (keepNewline && code === 0x0a) {
      out += char;
      continue;
    }
    out += isControl ? " " : char;
  }
  return out;
}

/**
 * Sanitize one interpolated value for the terminal.
 *
 * @param value Value to sanitize.
 * @returns {string} Sanitized single-line text.
 */
export function sanitizeTerminalText(value: unknown): string {
  return replaceControlBytes(stripVTControlCharacters(String(value)), false)
    .replace(SPACE_RUNS, " ")
    .trim();
}

/**
 * Sanitize a multi-line tool output while keeping its line and indent structure.
 *
 * @param text Multi-line output.
 * @returns {string} Sanitized multi-line text.
 */
function sanitizeTerminalBlock(text: string): string {
  return replaceControlBytes(stripVTControlCharacters(text), true);
}

type UrlsToolResult = AgentToolResult<undefined>;

function textResult(text: string): UrlsToolResult {
  return {
    content: [{ type: "text", text: sanitizeTerminalBlock(text) }],
    details: undefined,
  };
}

/**
 * One URL per line; used for a single selected source.
 *
 * @param urls Discovered URL records from one source.
 * @returns {string} The URL list or a short empty message.
 */
function formatUrlList(urls: readonly UrlsModule.DiscoveredUrl[]): string {
  return urls.length === 0 ? "No URLs found" : urls.map((url) => url.url).join("\n");
}

/**
 * Register Urls tools with the OMP extension host.
 *
 * OMP validates tool parameters with its own TypeBox build, so schemas must come from the
 * host-injected facade rather than a standalone typebox import.
 *
 * @param pi Host-injected extension API.
 */
export default function urlsExtension(pi: ExtensionAPI): void {
  const { Type } = pi.typebox;
  pi.setLabel("Urls");

  type RenderCallOptions = { readonly isPartial?: boolean; readonly spinnerFrame?: number };

  /**
   * Build the status-line payload. The host `theme` stays on `renderCall` so its type is
   * inferred and `ignoreInferredTypes` applies — no `Parameters<>` alias, no disable.
   *
   * @param title Tool title.
   * @param description Short call description.
   * @param options Render state.
   * @returns {object} The payload `renderStatusLine` expects as its first argument.
   */
  function statusPayload(
    title: string,
    description: string,
    options: RenderCallOptions,
  ): Parameters<typeof renderStatusLine>[0] {
    const icon = options.isPartial
      ? options.spinnerFrame === undefined
        ? "pending"
        : "running"
      : "done";
    return {
      icon,
      spinnerFrame: options.spinnerFrame,
      title,
      description: sanitizeTerminalText(description),
    };
  }

  const discoverParameters = Type.Object({
    domain: Type.String({
      description: "Target domain to discover URLs for, for example 'example.com'",
      minLength: 1,
    }),
    limit: Type.Optional(
      Type.Integer({
        description: "Maximum number of URLs to return",
        minimum: 1,
        maximum: 100000,
      }),
    ),
    match: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        description:
          "Keep only URLs containing at least one of these substrings (case-insensitive)",
      }),
    ),
    filter: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        description: "Drop URLs containing any of these substrings (case-insensitive)",
      }),
    ),
    noScope: Type.Optional(
      Type.Boolean({
        description: "Disable the default host-based scope and keep every URL a source returns",
      }),
    ),
    provider: Type.Optional(
      Type.String({
        description:
          "Registered source key, or 'all' to compare every source; use urls_providers to list all sources",
        minLength: 1,
      }),
    ),
  });

  pi.registerTool({
    name: "urls_discover",
    label: "Urls Discover",
    description:
      "Enumerate URLs known for a domain from passive sources. Returns one URL per line; pass provider 'all' to compare every source.",
    parameters: discoverParameters,
    approval: "read",
    renderCall(args, options, theme) {
      return new Text(
        renderStatusLine(statusPayload("Urls Discover", String(args.domain), options), theme),
        0,
        0,
      );
    },
    async execute(_toolCallId, params): Promise<UrlsToolResult> {
      const lib = await loadLibrary();
      const options = {
        limit: params.limit,
        match: params.match,
        filter: params.filter,
        noScope: params.noScope,
      };
      const outcome = await lib.runDiscover(params.domain, options, params.provider);
      if (outcome.mode === "comparison") {
        return textResult(lib.formatDiscoverAll(params.domain, outcome.outcomes));
      }
      return textResult(formatUrlList(outcome.urls));
    },
  });

  const providersParameters = Type.Object({});

  pi.registerTool({
    name: "urls_providers",
    label: "Urls Providers",
    description: "List registered passive URL source keys accepted by urls_discover.",
    parameters: providersParameters,
    approval: "read",
    renderCall(_args, options, theme) {
      return new Text(
        renderStatusLine(statusPayload("Urls Providers", "list", options), theme),
        0,
        0,
      );
    },
    async execute(): Promise<UrlsToolResult> {
      const lib = await loadLibrary();
      return textResult(lib.formatProviders(lib.listProviders()));
    },
  });
}
