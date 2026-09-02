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
 */
// oxlint-disable-next-line no-control-regex -- Terminal control bytes are precisely what this boundary removes.
const CONTROL_BYTES = /[\u0000-\u001F\u007F-\u009F]/g;
// oxlint-disable-next-line no-control-regex -- Same boundary, with newlines kept for block output.
const CONTROL_BYTES_KEEP_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const SPACE_RUNS = / +/g;

/**
 * Sanitize one interpolated value for the terminal.
 *
 * @param value Value to sanitize.
 * @returns {string} Sanitized single-line text.
 */
export function sanitizeTerminalText(value: unknown): string {
  return stripVTControlCharacters(String(value))
    .replace(CONTROL_BYTES, " ")
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
  return stripVTControlCharacters(text).replace(CONTROL_BYTES_KEEP_NEWLINE, " ");
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
  type RenderTheme = Parameters<typeof renderStatusLine>[1];

  /**
   * Build one sanitized status line for the TUI renderer.
   *
   * @param title Tool title.
   * @param description Short call description.
   * @param options Render state.
   * @param theme Render theme.
   * @returns {Text} A Text row.
   */
  function statusLine(
    title: string,
    description: string,
    options: RenderCallOptions,
    // RenderTheme is an alias over `Parameters<typeof renderStatusLine>[1]`, which resolves
    // structurally and never matches the allow list by name. A/B verified 2026-09-02: the
    // comment is required, the rule is red without it.
    // oxlint-disable-next-line typescript/prefer-readonly-parameter-types
    theme: RenderTheme,
  ): Text {
    const icon = options.isPartial
      ? options.spinnerFrame === undefined
        ? "pending"
        : "running"
      : "done";

    return new Text(
      renderStatusLine(
        {
          icon,
          spinnerFrame: options.spinnerFrame,
          title,
          description: sanitizeTerminalText(description),
        },
        theme,
      ),
      0,
      0,
    );
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
      return statusLine("Urls Discover", String(args.domain), options, theme);
    },
    async execute(_toolCallId, params): Promise<UrlsToolResult> {
      const lib = await loadLibrary();
      const options = {
        limit: params.limit,
        match: params.match,
        filter: params.filter,
        noScope: params.noScope,
      };
      if (lib.isAllProviders(params.provider)) {
        const outcomes = await lib.discoverAll(params.domain, options);
        return textResult(lib.formatDiscoverAll(params.domain, outcomes));
      }
      if (params.provider?.trim()) {
        const selected = await lib.selectProvider(params.provider);
        const discover = lib.requireOperation(selected.provider, "discover");
        return textResult(formatUrlList(await discover(params.domain, options)));
      }
      const fallback = await lib.discoverWithFallback(params.domain, options);
      return textResult(formatUrlList(fallback.result));
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
      return statusLine("Urls Providers", "list", options, theme);
    },
    async execute(): Promise<UrlsToolResult> {
      const lib = await loadLibrary();
      return textResult(lib.formatProviders(lib.listProviders()));
    },
  });
}
