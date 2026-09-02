/** Discover URLs for a domain across passive sources */
import { defineCommand } from "citty";
import consola from "consola";
import { discoverAll, discoverWithFallback } from "../core/all.ts";
import { formatDiscoverAll, formatUrlLine } from "../core/format.ts";
import { requireOperation } from "../core/provider.ts";
import { isAllProviders, selectProvider } from "../core/resolve.ts";
import type { DiscoveredUrl, DiscoverOptions } from "../core/types.ts";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number.parseInt(value, 10);
  if (Number.isNaN(limit) || limit < 1) {
    consola.error(`Invalid limit: ${value}`);
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

/**
 * Fan out to every source and print the comparison.
 *
 * @param jsonl Emit JSONL instead of plain lines.
 * @param domain Target domain.
 * @param options Discovery options.
 */
async function runAllSources(
  jsonl: boolean,
  domain: string,
  options: DiscoverOptions,
): Promise<void> {
  const outcomes = await discoverAll(domain, options);
  if (!jsonl) {
    consola.log(formatDiscoverAll(domain, outcomes));
    return;
  }
  for (const outcome of outcomes) {
    if (outcome.error) continue;
    printJsonl(domain, outcome.result);
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
      description: "Maximum number of URLs",
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
    };
    const jsonl = args.jsonl ?? false;
    const domain = args.domain;
    try {
      if (isAllProviders(args.provider)) {
        await runAllSources(jsonl, domain, options);
        return;
      }

      let urls: DiscoveredUrl[];
      if (args.provider?.trim()) {
        const selected = selectProvider(args.provider);
        urls = await requireOperation(selected.provider, "discover")(domain, options);
      } else {
        urls = (await discoverWithFallback(domain, options)).result;
      }
      await printResults(domain, urls, jsonl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      consola.error(`Error: ${message}`);
      process.exit(1);
    }
  },
});
