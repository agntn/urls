/** Behind `urls discover`: every URL the walk finds, as lines a pipe can take. */

import { sanitizeLine, sanitizeText, type Static, type ToolResult } from "@agntn/tools";
import type { listSchema } from "./cli-commands.ts";
import { runDiscover } from "./core/discover.ts";
import { formatDiscoverAll, formatUrlLine } from "./core/format.ts";
import type { DiscoverOptions, DiscoveredUrl } from "./core/types.ts";

/** The records behind the printed lines. */
export interface ListDetails {
  readonly urls: readonly DiscoveredUrl[];
}

/**
 * A comma separated flag as the list the library takes.
 *
 * @param value - Flag value.
 * @returns {string[] | undefined} The trimmed items, or nothing when none is left.
 */
function items(value: string | undefined): string[] | undefined {
  const list = value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  return list && list.length > 0 ? list : undefined;
}

/**
 * The flags of `urls discover` as the options the library takes.
 *
 * @param params - Validated command arguments.
 * @param signal - The CLI's cancel signal.
 * @returns {DiscoverOptions} Discovery options.
 */
function discoverOptions(
  params: Static<typeof listSchema>,
  signal: AbortSignal | undefined,
): DiscoverOptions {
  return {
    limit: params.limit,
    match: items(params.match),
    filter: items(params.filter),
    noScope: params.scope === false,
    urlScope: items(params.urlScope),
    urlOutScope: items(params.urlOutScope),
    ext: items(params.ext),
    hasQuery: params.hasQuery,
    from: params.from,
    to: params.to,
    signal,
  };
}

/**
 * One record as `--jsonl` prints it: the URL first, absent fields left out.
 *
 * @param input - Domain the command was given.
 * @param url - Discovered URL.
 * @returns {string} One JSON line.
 */
function jsonLine(input: string, url: DiscoveredUrl): string {
  return JSON.stringify({
    url: url.url,
    input,
    source: url.source,
    ...(url.ext ? { ext: url.ext } : {}),
    ...(url.queryKeys ? { queryKeys: url.queryKeys } : {}),
    ...(url.firstSeen ? { firstSeen: url.firstSeen } : {}),
    ...(url.lastSeen ? { lastSeen: url.lastSeen } : {}),
  });
}

/**
 * Text for a pipe. Nothing to say prints nothing at all, not one blank line.
 *
 * @param text - Lines to print.
 * @param urls - The records behind them.
 * @returns {ToolResult<ListDetails>} The result.
 */
function printed(text: string, urls: readonly DiscoveredUrl[]): ToolResult<ListDetails> {
  if (text === "") return { content: [], details: { urls } };
  return { content: [{ type: "text", text: sanitizeText(text) }], details: { urls } };
}

/**
 * Every URL the walk finds for `urls discover`, unbounded unless `limit` says otherwise.
 *
 * @param params - Validated command arguments.
 * @param signal - The CLI's cancel signal.
 * @returns {Promise<ToolResult<ListDetails>>} Bare URLs, JSON lines or the comparison blocks.
 */
export async function list(
  params: Static<typeof listSchema>,
  signal?: AbortSignal,
): Promise<ToolResult<ListDetails>> {
  const domain = sanitizeLine(params.domain);
  const provider = params.provider === undefined ? undefined : sanitizeLine(params.provider);
  const outcome = await runDiscover(domain, discoverOptions(params, signal), provider);
  const urls =
    outcome.mode === "single"
      ? outcome.urls
      : outcome.outcomes.flatMap((entry) => entry.result ?? []);
  if (params.jsonl === true) {
    return printed(urls.map((url) => jsonLine(domain, url)).join("\n"), urls);
  }
  if (outcome.mode === "comparison") {
    return printed(formatDiscoverAll(domain, outcome.outcomes), urls);
  }
  if (urls.length === 0) process.stderr.write(`No URLs found for ${domain}\n`);
  return printed(urls.map(formatUrlLine).join("\n"), urls);
}
