/** `discover` as the CLI alone gets it: every URL, one per line, for a pipe. */

import { defineTool, Type } from "@agntn/tools";
import type { CliOptions } from "@agntn/tools/cli";
import { UrlsError } from "./core/errors.ts";
import { MAX_DISCOVER_RESULTS } from "./core/types.ts";
import { serverInfo } from "./server-info.ts";
import { urlsTools } from "./tools.ts";

const filled = (description: string) => Type.Optional(Type.String({ pattern: "\\S", description }));

export const listSchema = Type.Object(
  {
    domain: Type.String({
      pattern: "\\S",
      description: "Target domain (for example example.com)",
    }),
    provider: filled('Source, or "all" to fan out to every source'),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: MAX_DISCOVER_RESULTS,
        description: `Maximum number of URLs per source (1..${MAX_DISCOVER_RESULTS})`,
      }),
    ),
    match: filled("Comma-separated substrings; keep only URLs containing one"),
    filter: filled("Comma-separated substrings; drop URLs containing one"),
    scope: Type.Optional(
      Type.Boolean({ description: "Keep the default host-based scope; --no-scope drops it" }),
    ),
    urlScope: filled("Comma-separated URL prefixes or globs; keep only matching URLs"),
    urlOutScope: filled("Comma-separated URL prefixes or globs; drop matching URLs"),
    ext: filled("Comma-separated path extensions to keep (js, json, bak)"),
    hasQuery: Type.Optional(
      Type.Boolean({
        description: "Keep only URLs that still have query keys after dropping tracking keys",
      }),
    ),
    from: filled("Inclusive start of the seen-at window (2019 or ISO date)"),
    to: filled("Inclusive end of the seen-at window (2019 or ISO date)"),
    jsonl: Type.Optional(Type.Boolean({ description: "Emit one JSON object per URL" })),
  },
  { additionalProperties: false },
);

export const discoverCommand = defineTool({
  name: "urls_list",
  title: "Discover URLs",
  description: "Enumerate URLs for a domain from passive sources",
  effect: "read",
  openWorld: true,
  input: listSchema,
  cli: {
    command: "discover",
    positional: ["domain"],
    short: { provider: "p", limit: "n", match: "m", filter: "f", jsonl: "j" },
    json: false,
  },
  execute: async (params, { signal }) => (await import("./cli-operations.ts")).list(params, signal),
});

/** What `urls` runs on, shared with the tests so they drive the same commands. */
export const cliOptions = {
  ...serverInfo,
  tools: urlsTools,
  commands: [discoverCommand],
  mcp: true,
  expected: (error) => error instanceof UrlsError,
} satisfies CliOptions;
