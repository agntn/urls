/** Human-readable formatting shared by the CLI and the agent tools */

import { MAX_DISCOVER_RESULTS } from "./types.ts";
import type { UrlsError } from "./errors.ts";
import type { DiscoveredUrl } from "./types.ts";
import type { ProviderOutcome, SerializedOutcome } from "./all.ts";
import type { ProviderListing } from "./registry.ts";
import type { DiscoverPage } from "./discover.ts";

/** Line breaks only. Escape sequences stay whole for the executor's sanitizer to strip. */
const LINE_BREAKS = /[\n\r\v\f\u0085\u2028\u2029]+/gu;

/**
 * Someone else's words on one line, so they can't start a row of their own.
 *
 * @param text URL, domain or message as it came in.
 * @returns {string} The text with every run of line breaks as one space.
 */
function oneLine(text: string): string {
  return text.replaceAll(LINE_BREAKS, " ").trim();
}

/**
 * One URL line: plain URL for single-source output.
 *
 * @param url Discovered URL record.
 * @returns {string} The bare URL on one line.
 */
export function formatUrlLine(url: DiscoveredUrl): string {
  return oneLine(url.url);
}

/** Header details for one source block that the URL records alone cannot carry. */
export interface SourceBlockOptions {
  /** Source key for the tag; without it an empty block has no record to read it from */
  readonly source?: string;
  /** Remark appended to the summary line */
  readonly note?: string;
}

/**
 * Block of one provider's results, tagged with the source key.
 *
 * @param input Input domain the URLs belong to.
 * @param urls Discovered URL records from one source.
 * @param options Source tag and remark for the summary line.
 * @returns {string} Multi-line block starting with a source-tagged summary line.
 */
export function formatSourceBlock(
  input: string,
  urls: readonly DiscoveredUrl[],
  options: SourceBlockOptions = {},
): string {
  const lines = urls.map((url) => `  ${formatUrlLine(url)}`);
  return [sourceHeader(input, urls, options), ...lines].join("\n");
}

/**
 * Summary line of one source block.
 *
 * @param input Input domain the URLs belong to.
 * @param urls Discovered URL records from one source.
 * @param options Source tag and remark.
 * @returns {string} The source tag, the count and the remark.
 */
function sourceHeader(
  input: string,
  urls: readonly DiscoveredUrl[],
  options: SourceBlockOptions,
): string {
  const source = options.source ?? urls[0]?.source ?? "?";
  const remark = options.note ? ` (${options.note})` : "";
  return `[${source}] ${urls.length} URLs for "${oneLine(input)}"${remark}`;
}

/**
 * Capture days of one URL, as the tools print them after it.
 *
 * @param url Discovered URL record.
 * @returns {string} One day, a `first..last` span, or nothing for an undated URL.
 */
function seenSuffix(url: DiscoveredUrl): string {
  if (!url.firstSeen) return "";
  const first = url.firstSeen.slice(0, DAY_LENGTH);
  const last = (url.lastSeen ?? url.firstSeen).slice(0, DAY_LENGTH);
  return first === last ? `  ${first}` : `  ${first}..${last}`;
}

/**
 * URL lines of one page for the agent tools, each run under the query that returned it.
 *
 * @param urls Records of one page.
 * @returns {string[]} Indented URL lines, with a `via` line where the query URL changes.
 */
function pageLines(urls: readonly DiscoveredUrl[]): string[] {
  const lines: string[] = [];
  let via: string | undefined;
  for (const url of urls) {
    if (url.reference !== undefined && url.reference !== via) {
      via = url.reference;
      lines.push(`  via ${oneLine(via)}`);
    }
    lines.push(`  ${formatUrlLine(url)}${seenSuffix(url)}`);
  }
  return lines;
}

/** Length of the day in an ISO instant. */
const DAY_LENGTH = 10;

/** The way past a cut page that a higher limit cannot open. */
const NARROW = "narrow with match, ext, urlScope";

/**
 * Remark for a page that ends before the source does: what cut it and how to get past it, since
 * there is no cursor.
 *
 * @param page One source's page.
 * @returns {string | undefined} The remark, or undefined when the source had no more.
 */
function limitNote(page: DiscoverPage): string | undefined {
  if (!page.hasMore) return undefined;
  if (page.truncated) {
    return "source stopped early with more advertised and no cursor to continue; try another source";
  }
  if (page.limit >= MAX_DISCOVER_RESULTS) return `limit ${page.limit} reached; ${NARROW}`;
  return `limit ${page.limit} reached; raise limit or ${NARROW}`;
}

/**
 * One source's page as bare lines: one URL per line, then the remark when the page ends before
 * the source does.
 *
 * @param page One source's page.
 * @returns {string} The URL lines or a short empty message, with the remark when there is one.
 */
export function formatDiscoverPage(page: DiscoverPage): string {
  const lines = page.urls.length === 0 ? ["No URLs found"] : page.urls.map(formatUrlLine);
  const note = limitNote(page);
  return [...lines, ...(note ? [note] : [])].join("\n");
}

/**
 * A failure on one line.
 *
 * @param error Normalized failure or its message.
 * @returns {string} The message without line breaks.
 */
function errorLine(error: UrlsError | string): string {
  return oneLine(typeof error === "string" ? error : error.message);
}

/**
 * What the agent tools answer with: one source-tagged block per page, errors included.
 *
 * @param input Input domain the URLs belong to.
 * @param outcomes Pages or failures per provider, as the registry or JSON carries them.
 * @returns {string} A summary line per source over its dated URLs, or its error.
 */
export function formatDiscoverPages(
  input: string,
  outcomes: readonly (ProviderOutcome<DiscoverPage> | SerializedOutcome<DiscoverPage>)[],
): string {
  return outcomes
    .map((outcome) => {
      if (outcome.error !== undefined) {
        return `[${outcome.provider}] error: ${errorLine(outcome.error)}`;
      }
      const page = outcome.result;
      if (page === undefined) return `[${outcome.provider}] error: no answer`;
      const header = sourceHeader(input, page.urls, {
        source: outcome.provider,
        note: limitNote(page),
      });
      return [header, ...pageLines(page.urls)].join("\n");
    })
    .join("\n");
}

/**
 * Side-by-side comparison across providers, errors included.
 *
 * @param input Input domain the URLs belong to.
 * @param outcomes Per-provider results or normalized failures.
 * @returns {string} One source-tagged block per provider, errors flattened to messages.
 */
export function formatDiscoverAll(
  input: string,
  outcomes: readonly ProviderOutcome<readonly DiscoveredUrl[]>[],
): string {
  return outcomes
    .map((outcome) =>
      outcome.error
        ? `[${outcome.provider}] error: ${errorLine(outcome.error)}`
        : formatSourceBlock(input, outcome.result, { source: outcome.provider }),
    )
    .join("\n");
}

/**
 * JSON-safe comparison lines for MCP / AI output.
 *
 * @param outcomes Per-provider results or normalized failures.
 * @returns {SerializedOutcome<readonly DiscoveredUrl[]>[]} Outcomes reduced to JSON-safe records.
 */
export function serializeDiscoverAll(
  outcomes: readonly ProviderOutcome<readonly DiscoveredUrl[]>[],
): SerializedOutcome<readonly DiscoveredUrl[]>[] {
  return outcomes.map((outcome) => {
    if (outcome.error) return { provider: outcome.provider, error: outcome.error.message };
    return { provider: outcome.provider, result: outcome.result };
  });
}

/**
 * Registered providers table.
 *
 * @param listings Registered providers with capabilities.
 * @returns {string} Human-readable table of providers, endpoints, and capabilities.
 */
export function formatProviders(listings: readonly ProviderListing[]): string {
  const header = `Registered providers (${listings.length}):`;
  const rows = listings.map((listing) => {
    const capability = listing.requiresKey
      ? "requires API key"
      : listing.capabilities?.discover
        ? "discover"
        : "none";
    return `  ${listing.name.padEnd(14)} ${listing.defaultUrl ?? ""}  (${capability})`;
  });
  return [header, ...rows].join("\n");
}
