/** Discovery executors shared by the MCP server, AI tools, and both agent extensions. */

import { discoverAll, discoverWithFallback } from "./core/all.ts";
import type { ProviderOutcome } from "./core/all.ts";
import { requireOperation } from "./core/provider.ts";
import { isAllProviders, selectProvider } from "./core/resolve.ts";
import { clampMaxResults, DEFAULT_DISCOVER_LIMIT, MAX_DISCOVER_RESULTS } from "./core/types.ts";
import type { DiscoverOptions, DiscoveredUrl } from "./core/types.ts";

/** Outcome of one discovery request, before any surface-specific formatting. */
export type DiscoverResult =
  | { mode: "single"; provider: string; urls: DiscoveredUrl[] }
  | { mode: "comparison"; outcomes: ProviderOutcome<DiscoveredUrl[]>[] };

/** Discovery options as the agent surfaces take them: a bounded page, provenance on request. */
export interface DiscoverPageOptions extends DiscoverOptions {
  /** Keep the query URL on each record; it is the same for every URL one request returned */
  readonly reference?: boolean;
}

/** One source's page of URLs, with the bound that cut it and whether the source had more. */
export interface DiscoverPage {
  /** URLs on the page */
  readonly count: number;
  /** Bound applied to this page, the caller's or the default */
  readonly limit: number;
  /** True when the source had at least one more URL past the bound; always false at the published bound */
  readonly hasMore: boolean;
  /** Discovered URLs, in source order */
  readonly urls: readonly DiscoveredUrl[];
}

/** Outcome of one agent discovery request: one source's page or one page per source. */
export type DiscoverPageResult =
  | { mode: "single"; provider: string; page: DiscoverPage }
  | { mode: "comparison"; outcomes: ProviderOutcome<DiscoverPage>[] };

/**
 * Run one discovery request using the caller's provider selection.
 *
 * This is the single branch (explicit provider, "all" fan-out, or auto-selected fallback) the
 * MCP server, AI tools, and both agent extensions had each copied. Formats stay per surface:
 * MCP/AI serialize outcomes, extensions render text, the CLI prints lines.
 *
 * @param domain Target domain.
 * @param options Discovery options shared by every source.
 * @param provider Explicit source key, "all" for the fan-out, or absent for the fallback.
 * @returns {Promise<DiscoverResult>} One provider's results or the per-source comparison.
 */
export async function runDiscover(
  domain: string,
  options?: Readonly<DiscoverOptions>,
  provider?: string,
): Promise<DiscoverResult> {
  if (isAllProviders(provider)) {
    return { mode: "comparison", outcomes: await discoverAll(domain, options) };
  }
  if (provider?.trim()) {
    const selected = await selectProvider(provider);
    const discover = requireOperation(selected.provider, "discover");
    return { mode: "single", provider: selected.name, urls: await discover(domain, options) };
  }
  const fallback = await discoverWithFallback(domain, options);
  return { mode: "single", provider: fallback.provider, urls: fallback.result };
}

/**
 * Run one discovery request as the agent surfaces need it: bounded by default, one URL past the
 * bound fetched so the page can say whether the source had more, and the query URL dropped from
 * every record unless asked for. The library and CLI keep the unbounded `runDiscover`.
 *
 * @param domain Target domain.
 * @param options Page options: the shared discovery options plus `reference`.
 * @param provider Explicit source key, "all" for the fan-out, or absent for the fallback.
 * @returns {Promise<DiscoverPageResult>} One provider's page or one page per source.
 */
export async function runDiscoverPage(
  domain: string,
  options?: Readonly<DiscoverPageOptions>,
  provider?: string,
): Promise<DiscoverPageResult> {
  const limit = clampMaxResults(options?.limit ?? DEFAULT_DISCOVER_LIMIT, MAX_DISCOVER_RESULTS);
  const { reference = false, ...discoverOptions } = options ?? {};
  const probe = { ...discoverOptions, limit: Math.min(limit + 1, MAX_DISCOVER_RESULTS) };
  const outcome = await runDiscover(domain, probe, provider);
  if (outcome.mode === "comparison") {
    return {
      mode: "comparison",
      outcomes: outcome.outcomes.map((entry) =>
        entry.error
          ? entry
          : { provider: entry.provider, result: toPage(entry.result, limit, reference) },
      ),
    };
  }
  return {
    mode: "single",
    provider: outcome.provider,
    page: toPage(outcome.urls, limit, reference),
  };
}

/**
 * Cut one source's probe result down to its page.
 *
 * @param urls URLs the source returned for `limit + 1`.
 * @param limit Bound the page reports.
 * @param reference Keep the query URL on each record.
 * @returns {DiscoverPage} The page with its bound and overflow flag.
 */
function toPage(urls: readonly DiscoveredUrl[], limit: number, reference: boolean): DiscoverPage {
  const kept = urls.slice(0, limit);
  return {
    count: kept.length,
    limit,
    hasMore: urls.length > limit,
    urls: reference ? kept : kept.map(withoutReference),
  };
}

/**
 * Drop the query URL from one record; it names the request, not the URL, and repeats per page.
 *
 * @param record Discovered URL.
 * @returns {DiscoveredUrl} The record without `reference`.
 */
function withoutReference(record: DiscoveredUrl): DiscoveredUrl {
  const { reference: _reference, ...rest } = record;
  return rest;
}
