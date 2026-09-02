/** Discover URLs for a domain across passive sources */
import { defineCommand } from "citty";
import consola from "consola";
import { formatDiscoverAll, formatUrlLine } from "../core/format.ts";
import { MAX_DISCOVER_RESULTS } from "../core/types.ts";
import type { DiscoveredUrl } from "../core/types.ts";
import { runDiscover } from "../tool-operations.ts";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number.parseInt(value, 10);
  if (Number.isNaN(limit) || limit < 1 || limit > MAX_DISCOVER_RESULTS) {
    consola.error(`Invalid limit: ${value} (expected 1..${MAX_DISCOVER_RESULTS})`);
    process.exit(1);
  }
  return limit;
}

function splitPatterns(value: string | undefined): string[] | undefined {
  const patterns = value
    ?.split(",")
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern !== "");
  return patterns && patterns.length > 0 ? patterns : undefined;
}

function printJsonl(input: string, urls: readonly DiscoveredUrl[]): void {
  for (const url of urls) {
    consola.log(JSON.stringify({ url: url.url, input, source: url.source }));
  }
}

/**
 * Print one provider's results, either as JSONL or as bare URL lines.
 *
 * @param input Target domain.
 * @param urls Discovered URLs from the selected source.
 * @param jsonl Emit JSONL instead of plain lines.
 */
async function printResults(
  input: string,
  urls: readonly DiscoveredUrl[],
  jsonl: boolean,
): Promise<void> {
  if (jsonl) {
    printJsonl(input, urls);
    return;
  }
  if (urls.length === 0) {
    consola.info(`No URLs found for ${input}`);
    return;
  }
  for (const url of urls) {
    consola.log(formatUrlLine(url));
  }
}

export default defineCommand({
  meta: {
    name: "discover",
    description: "Enumerate URLs for a domain from passive sources",
  },
  args: {
    domain: {
      type: "positional",
      description: "Target domain (for example example.com)",
      required: true,
    },
    provider: {
      type: "string",
      alias: "p",
      description: 'Source, or "all" to fan out to every source',
    },
    limit: {
      type: "string",
      alias: "n",
      description: `Maximum number of URLs (1..${MAX_DISCOVER_RESULTS})`,
    },
    match: {
      type: "string",
      alias: "m",
      description: "Comma-separated substrings; keep only URLs containing one",
    },
    filter: {
      type: "string",
      alias: "f",
      description: "Comma-separated substrings; drop URLs containing one",
    },
    "no-scope": {
      type: "boolean",
      alias: "ns",
      description: "Disable the default host-based scope",
    },
    "url-scope": {
      type: "string",
      alias: "us",
      description: "Comma-separated URL prefixes or globs; keep only matching URLs",
    },
    "url-out-scope": {
      type: "string",
      alias: "uos",
      description: "Comma-separated URL prefixes or globs; drop matching URLs",
    },
    jsonl: {
      type: "boolean",
      alias: "j",
      description: "Emit one JSON object per URL",
    },
  },
  async run({ args }) {
    const options = {
      limit: parseLimit(args.limit),
      match: splitPatterns(args.match),
      filter: splitPatterns(args.filter),
      noScope: args["no-scope"],
      urlScope: splitPatterns(args["url-scope"]),
      urlOutScope: splitPatterns(args["url-out-scope"]),
    };
    const jsonl = args.jsonl ?? false;
    const domain = args.domain;
    try {
      const outcome = await runDiscover(domain, options, args.provider);
      if (outcome.mode === "comparison") {
        if (!jsonl) {
          consola.log(formatDiscoverAll(domain, outcome.outcomes));
          return;
        }
        for (const entry of outcome.outcomes) {
          if (entry.error) continue;
          printJsonl(domain, entry.result);
        }
        return;
      }
      await printResults(domain, outcome.urls, jsonl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      consola.error(`Error: ${message}`);
      process.exit(1);
    }
  },
});
