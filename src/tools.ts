/** The urls tools, declared once for every host. Executors load on the first call. */

import {
  defineTool,
  Type,
  type TArray,
  type TOptional,
  type TString,
  type ToolDefinition,
} from "@agntn/tools";
import { DEFAULT_DISCOVER_LIMIT, MAX_DISCOVER_RESULTS } from "./core/types.ts";

type ToolOperations = typeof import("./tool-operations.ts");

let operations: Promise<ToolOperations> | undefined;

/**
 * Loads the executors once. A failed load isn't cached, so a broken `dist` doesn't stick.
 *
 * @returns {Promise<ToolOperations>} The executors module.
 */
export function loadOperations(): Promise<ToolOperations> {
  operations ??= import("./tool-operations.ts").catch((error: unknown) => {
    operations = undefined;
    throw error;
  });
  return operations;
}

/** Text that has to say something: blank or spaces only fail the schema. */
const FILLED = "\\S";

function optionalText(description: string): TOptional<TString> {
  return Type.Optional(Type.String({ pattern: FILLED, description }));
}

function optionalList(description: string): TOptional<TArray<TString>> {
  return Type.Optional(Type.Array(Type.String({ pattern: FILLED }), { description }));
}

export const providersTool = defineTool({
  name: "urls_providers",
  title: "List Providers",
  description: "List registered passive URL sources, their endpoints and which need an API key",
  snippet: "Use urls_providers to check which URL discovery sources are available.",
  guidelines: [
    "Use urls_providers to list source keys accepted by urls_discover and which need an API key.",
  ],
  effect: "read",
  input: Type.Object({}),
  cli: { description: "List registered sources and which need an API key" },
  execute: async () => (await loadOperations()).providers(),
});

export const discoverSchema = Type.Object(
  {
    domain: Type.String({
      pattern: FILLED,
      description: "Target domain to discover URLs for, for example 'example.com'",
    }),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: MAX_DISCOVER_RESULTS,
        description: `Maximum number of URLs to return; the answer says when the source had more. Defaults to ${DEFAULT_DISCOVER_LIMIT}; accepted range: 1-${MAX_DISCOVER_RESULTS}.`,
      }),
    ),
    match: optionalList(
      "Keep only URLs containing at least one of these substrings (case-insensitive)",
    ),
    filter: optionalList("Drop URLs containing any of these substrings (case-insensitive)"),
    noScope: Type.Optional(
      Type.Boolean({
        description: "Disable the default host-based scope and keep every URL a source returns",
      }),
    ),
    urlScope: optionalList(
      "Keep only URLs matching at least one URL-scope pattern (prefix or glob with *). Patterns apply to the full URL, not a domain.",
    ),
    urlOutScope: optionalList(
      "Drop URLs matching any URL-out-scope pattern (prefix or glob with *). Patterns apply to the full URL.",
    ),
    ext: optionalList("Keep only URLs whose path ends with one of these extensions (js, json)."),
    hasQuery: Type.Optional(
      Type.Boolean({
        description: "Keep only URLs that still have query keys after tracking keys are dropped.",
      }),
    ),
    from: optionalText("Inclusive start of the seen-at window (archive digits or ISO date)."),
    to: optionalText("Inclusive end of the seen-at window (archive digits or ISO date)."),
    reference: Type.Optional(
      Type.Boolean({
        description: "Add the source query URL under each URL it returned. Defaults to false.",
      }),
    ),
    provider: optionalText(
      "Registered source key, or 'all' to compare every source; use urls_providers to list all sources",
    ),
  },
  { additionalProperties: false },
);

export const discoverTool = defineTool({
  name: "urls_discover",
  title: "Discover URLs",
  description: `Enumerate URLs known for a domain from passive sources. The answer names the source, counts the URLs and lists one per line, at most ${DEFAULT_DISCOVER_LIMIT} unless limit says otherwise, with a note when the source had more. A URL the source dated ends with its first and last capture day. The default host filter keeps URLs under the input domain; urlScope and urlOutScope match full URLs. Pass provider 'all' to compare every source.`,
  snippet: "Use urls_discover to enumerate URLs publicly indexed for a domain.",
  guidelines: [
    "Use urls_discover with a bare domain like example.com; results come from passive sources only, with no active scanning.",
    `urls_discover returns one URL per line, at most ${DEFAULT_DISCOVER_LIMIT} unless limit says otherwise, and says on the first line when the source had more; pass provider 'all' to compare every registered source side by side.`,
    "Pass match and filter lists to urls_discover to keep or drop URLs by substring.",
    "Pass urlScope and urlOutScope to urls_discover as URL prefixes or globs; they apply to the full URL, not to a hostname.",
  ],
  effect: "read",
  openWorld: true,
  input: discoverSchema,
  execute: async (params, { signal }) => (await loadOperations()).discover(params, signal),
});

/** Every urls tool in the order hosts list them, each keeping its literal name for `toAiTools`. */
export const urlsTools = [providersTool, discoverTool] as const satisfies readonly ToolDefinition[];
