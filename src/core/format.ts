/** Human-readable formatting for CLI, Pi, and OMP output */

import type { DiscoveredUrl } from "./types.ts";
import type { ProviderOutcome, SerializedOutcome } from "./all.ts";
import type { ProviderListing } from "./registry.ts";

/**
 * One URL line: plain URL for single-source output.
 *
 * @param url Discovered URL record.
 * @returns {string} The bare URL string.
 */
export function formatUrlLine(url: DiscoveredUrl): string {
  return url.url;
}

/**
 * Block of one provider's results, tagged with the source key.
 *
 * @param input Input domain the URLs belong to.
 * @param urls Discovered URL records from one source.
 * @returns {string} Multi-line block starting with a source-tagged summary line.
 */
export function formatSourceBlock(input: string, urls: readonly DiscoveredUrl[]): string {
  const lines = urls.map((url) => `  ${url.url}`);
  return [`[${urls[0]?.source ?? "?"}] ${urls.length} URLs for "${input}"`, ...lines].join("\n");
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
  outcomes: readonly ProviderOutcome<DiscoveredUrl[]>[],
): string {
  return outcomes
    .map((outcome) =>
      outcome.error
        ? `[${outcome.provider}] error: ${outcome.error.message}`
        : formatSourceBlock(input, outcome.result),
    )
    .join("\n");
}

/**
 * JSON-safe comparison lines for MCP / AI output.
 *
 * @param outcomes Per-provider results or normalized failures.
 * @returns {SerializedOutcome<DiscoveredUrl[]>[]} Outcomes reduced to JSON-safe records.
 */
export function serializeDiscoverAll(
  outcomes: readonly ProviderOutcome<DiscoveredUrl[]>[],
): SerializedOutcome<DiscoveredUrl[]>[] {
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
