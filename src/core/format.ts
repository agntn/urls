/** Human-readable formatting for CLI, Pi, and OMP output */

import type { DiscoveredUrl } from "./types.ts";
import type { ProviderOutcome, SerializedOutcome } from "./all.ts";
import type { ProviderListing } from "./registry.ts";
import type { DiscoverPage } from "../tool-operations.ts";

/**
 * One URL line: plain URL for single-source output.
 *
 * @param url Discovered URL record.
 * @returns {string} The bare URL string.
 */
export function formatUrlLine(url: DiscoveredUrl): string {
  return url.url;
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
  const source = options.source ?? urls[0]?.source ?? "?";
  const remark = options.note ? ` (${options.note})` : "";
  const lines = urls.map((url) => `  ${url.url}`);
  return [`[${source}] ${urls.length} URLs for "${input}"${remark}`, ...lines].join("\n");
}

/**
 * Remark for a page cut at its bound: how to get past it, since there is no cursor.
 *
 * @param page One source's page.
 * @returns {string | undefined} The remark, or undefined when the source had no more.
 */
function limitNote(page: DiscoverPage): string | undefined {
  if (!page.hasMore) return undefined;
  return `limit ${page.limit} reached; raise limit or narrow with match, ext, urlScope`;
}

/**
 * One source's page as text for the agent extensions: one URL per line, then the remark when
 * the bound cut the list.
 *
 * @param page One source's page.
 * @returns {string} The URL lines, a short empty message, or both with the remark.
 */
export function formatDiscoverPage(page: DiscoverPage): string {
  if (page.urls.length === 0) return "No URLs found";
  const note = limitNote(page);
  return [...page.urls.map((url) => url.url), ...(note ? [note] : [])].join("\n");
}

/**
 * Side-by-side comparison of pages across providers, errors included.
 *
 * @param input Input domain the URLs belong to.
 * @param outcomes Per-provider pages or normalized failures.
 * @returns {string} One source-tagged block per provider, errors flattened to messages.
 */
export function formatDiscoverPages(
  input: string,
  outcomes: readonly ProviderOutcome<DiscoverPage>[],
): string {
  return outcomes
    .map((outcome) =>
      outcome.error
        ? `[${outcome.provider}] error: ${outcome.error.message}`
        : formatSourceBlock(input, outcome.result.urls, {
            source: outcome.provider,
            note: limitNote(outcome.result),
          }),
    )
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
        ? `[${outcome.provider}] error: ${outcome.error.message}`
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
