/** Vercel AI SDK tool surface over the normalized URL discovery operations. */

import { tool, type Tool } from "ai";
import { z } from "zod";
import type { DiscoveredUrl } from "./core/types.ts";
import type { SerializedOutcome } from "./core/all.ts";
import { discoverAll, discoverWithFallback, serializeOutcomes } from "./core/all.ts";
import { requireOperation } from "./core/provider.ts";
import { providers } from "./core/registry.ts";
import { isAllProviders, selectProvider } from "./core/resolve.ts";
import {
  domainInput,
  filterInput,
  limitInput,
  matchInput,
  noScopeInput,
  providerInput,
} from "./core/schemas.ts";

const discoverInputSchema = z.object({
  domain: domainInput,
  limit: limitInput,
  match: matchInput,
  filter: filterInput,
  noScope: noScopeInput,
  ...providerInput,
});

type DiscoverToolOutput =
  | { provider: string; count: number; urls: DiscoveredUrl[] }
  | { comparison: SerializedOutcome<DiscoveredUrl[]>[] };

export const discoverTool: Tool<z.infer<typeof discoverInputSchema>, DiscoverToolOutput> = tool({
  description:
    "Enumerate URLs known for a domain from passive sources. Pass provider 'all' to compare every source.",
  inputSchema: discoverInputSchema,
  execute: async ({ domain, limit, match, filter, noScope, provider }) => {
    const options = { limit, match, filter, noScope };
    if (isAllProviders(provider)) {
      return { comparison: serializeOutcomes(await discoverAll(domain, options)) };
    }
    if (provider?.trim()) {
      const selected = await selectProvider(provider);
      const discover = requireOperation(selected.provider, "discover");
      const urls = await discover(domain, options);
      return { provider: selected.name, count: urls.length, urls };
    }
    const fallback = await discoverWithFallback(domain, options);
    return { provider: fallback.provider, count: fallback.result.length, urls: fallback.result };
  },
});

export const providersTool: Tool<Record<string, never>, { providers: string[] }> = tool({
  description: "List registered urls source keys accepted by the other urls tools.",
  inputSchema: z.object({}),
  execute: async () => {
    return { providers: providers() };
  },
});
