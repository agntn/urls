/** Vercel AI SDK tool surface over the normalized URL discovery operations. */

import { tool, type Tool } from "ai";
import { z } from "zod";
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
  referenceInput,
  urlOutScopeInput,
  urlScopeInput,
  extInput,
  hasQueryInput,
  fromInput,
  toInput,
} from "./core/schemas.ts";
import { runDiscoverPage } from "./tool-operations.ts";
import type { DiscoverPage } from "./tool-operations.ts";

const discoverInputSchema = z.object({
  domain: domainInput,
  limit: limitInput,
  match: matchInput,
  filter: filterInput,
  noScope: noScopeInput,
  urlScope: urlScopeInput,
  urlOutScope: urlOutScopeInput,
  ext: extInput,
  hasQuery: hasQueryInput,
  from: fromInput,
  to: toInput,
  reference: referenceInput,
  ...providerInput,
});

type DiscoverToolOutput =
  | ({ provider: string } & DiscoverPage)
  | { comparison: SerializedOutcome<DiscoverPage>[] };

export const discoverTool: Tool<z.infer<typeof discoverInputSchema>, DiscoverToolOutput> = tool({
  description:
    "Enumerate URLs known for a domain from passive sources. The answer counts the URLs and says whether the source had more than the limit. Pass provider 'all' to compare every source.",
  inputSchema: discoverInputSchema,
  execute: async (
    {
      domain,
      limit,
      match,
      filter,
      noScope,
      urlScope,
      urlOutScope,
      ext,
      hasQuery,
      from,
      to,
      reference,
      provider,
    },
    { abortSignal },
  ) => {
    const options = {
      limit,
      match,
      filter,
      noScope,
      urlScope,
      urlOutScope,
      ext,
      hasQuery,
      from,
      to,
      reference,
      signal: abortSignal,
    };
    const outcome = await runDiscoverPage(domain, options, provider);
    if (outcome.mode === "comparison") {
      return { comparison: serializeOutcomes(outcome.outcomes) };
    }
    return { provider: outcome.provider, ...outcome.page };
  },
});

export const providersTool: Tool<Record<string, never>, { providers: string[] }> = tool({
  description: "List registered urls source keys accepted by the other urls tools.",
  inputSchema: z.object({}),
  execute: async () => {
    return { providers: providers() };
  },
});
