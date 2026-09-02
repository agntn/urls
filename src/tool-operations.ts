/** Discovery executors shared by the MCP server, AI tools, and both agent extensions. */

import { discoverAll, discoverWithFallback } from "./core/all.ts";
import type { ProviderOutcome } from "./core/all.ts";
import { requireOperation } from "./core/provider.ts";
import { isAllProviders, selectProvider } from "./core/resolve.ts";
import type { DiscoverOptions, DiscoveredUrl } from "./core/types.ts";

/** Outcome of one discovery request, before any surface-specific formatting. */
export type DiscoverResult =
  | { mode: "single"; provider: string; urls: DiscoveredUrl[] }
  | { mode: "comparison"; outcomes: ProviderOutcome<DiscoveredUrl[]>[] };

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
