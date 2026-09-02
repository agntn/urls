/** Pi extension: Urls - unified passive URL discovery tools */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type * as UrlsModule from "../../../dist/index.d.mts";

const sourceModuleUrl = new URL("../../../src/index.ts", import.meta.url);
const distributionModuleUrl = new URL("../../../dist/index.mjs", import.meta.url);
let urlsModulePromise: Promise<typeof UrlsModule> | undefined;

/**
 * Load current source in development and fall back to the built package in distributions.
 *
 * @returns {Promise<typeof UrlsModule>} The library module, source in development, built package in distributions.
 */
function loadLibrary(): Promise<typeof UrlsModule> {
  urlsModulePromise ??= import(
    existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl.href : distributionModuleUrl.href
  ) as Promise<typeof UrlsModule>;

  return urlsModulePromise;
}

type UrlsToolResult = AgentToolResult<undefined>;

function textResult(text: string): UrlsToolResult {
  return {
    content: [{ type: "text", text }],
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

export default function urlsExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "urls_discover",
    label: "Urls Discover",
    description: "Enumerate URLs known for a domain from passive sources",
    promptSnippet: "Use urls_discover to enumerate URLs publicly indexed for a domain.",
    promptGuidelines: [
      "Use urls_discover with a bare domain like example.com; results come from passive sources only, with no active scanning.",
      "urls_discover returns one URL per line; pass provider 'all' to compare every registered source side by side.",
      "Pass match and filter lists to urls_discover to keep or drop URLs by substring.",
    ],
    parameters: Type.Object({
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
    }),
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
        const selected = lib.selectProvider(params.provider);
        const discover = lib.requireOperation(selected.provider, "discover");
        return textResult(formatUrlList(await discover(params.domain, options)));
      }
      const fallback = await lib.discoverWithFallback(params.domain, options);
      return textResult(formatUrlList(fallback.result));
    },
  });

  pi.registerTool({
    name: "urls_providers",
    label: "Urls Providers",
    description: "List registered passive URL sources",
    promptSnippet: "Use urls_providers to check which URL discovery sources are available.",
    promptGuidelines: [
      "Use urls_providers to list source keys accepted by urls_discover and which need an API key.",
    ],
    parameters: Type.Object({}),
    async execute(): Promise<UrlsToolResult> {
      const lib = await loadLibrary();
      return textResult(lib.formatProviders(lib.listProviders()));
    },
  });
}
