/** Vercel AI SDK tool surface over the normalized URL discovery operations. */

import { tool, type Tool } from "ai";
import { z } from "zod";
import type { DiscoveredUrl } from "./core/types.ts";
import type { SerializedOutcome } from "./core/all.ts";
import { serializeOutcomes } from "./core/all.ts";
import { providers } from "./core/registry.ts";
import {
  domainInput,
  filterInput,
  limitInput,
  matchInput,
  noScopeInput,
  providerInput,
  urlOutScopeInput,
  urlScopeInput,
} from "./core/schemas.ts";
import { runDiscover } from "./tool-operations.ts";

const discoverInputSchema = z.object({
  domain: domainInput,
  limit: limitInput,
  match: matchInput,
  filter: filterInput,
  noScope: noScopeInput,
  urlScope: urlScopeInput,
  urlOutScope: urlOutScopeInput,
  ...providerInput,
});

type DiscoverToolOutput =
  | { provider: string; count: number; urls: DiscoveredUrl[] }
  | { comparison: SerializedOutcome<DiscoveredUrl[]>[] };

export const discoverTool: Tool<z.infer<typeof discoverInputSchema>, DiscoverToolOutput> = tool({
  description:
    "Enumerate URLs known for a domain from passive sources. Pass provider 'all' to compare every source.",
  inputSchema: discoverInputSchema,
  execute: async ({ domain, limit, match, filter, noScope, urlScope, urlOutScope, provider }) => {
    const options = { limit, match, filter, noScope, urlScope, urlOutScope };
    const outcome = await runDiscover(domain, options, provider);
    if (outcome.mode === "comparison") {
      return { comparison: serializeOutcomes(outcome.outcomes) };
    }
    return { provider: outcome.provider, count: outcome.urls.length, urls: outcome.urls };
  },
});

export const providersTool: Tool<Record<string, never>, { providers: string[] }> = tool({
  description: "List registered urls source keys accepted by the other urls tools.",
  inputSchema: z.object({}),
  execute: async () => {
    return { providers: providers() };
  },
});
