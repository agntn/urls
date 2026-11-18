/** Executors behind the urls tools: one text for every host, the data as details. */

import { sanitizeLine, sanitizeText, type Static, type ToolResult } from "@agntn/tools";
import { serializeOutcomes, type SerializedOutcome } from "./core/all.ts";
import { runDiscoverPage, type DiscoverPage } from "./core/discover.ts";
import { formatDiscoverPages, formatProviders } from "./core/format.ts";
import { listProviders, type ProviderListing } from "./core/registry.ts";
import type { discoverSchema } from "./tools.ts";

export interface ProvidersDetails {
  readonly providers: readonly ProviderListing[];
}

export type DiscoverDetails =
  | ({ provider: string } & DiscoverPage)
  | { comparison: SerializedOutcome<DiscoverPage>[] };

/** Tool arguments as an executor reads them: lists it never writes to. */
type Input<Schema> = {
  readonly [Key in keyof Schema]: Schema[Key] extends (infer Item)[] | undefined
    ? readonly Item[] | Extract<Schema[Key], undefined>
    : Schema[Key];
};

/**
 * Source text reaches terminals here: lines and indents stay, escapes and bidi tricks don't.
 *
 * @param text - Text for the host.
 * @param details - The data behind it.
 * @returns {ToolResult<Details>} The tool result.
 */
function answer<Details>(text: string, details: Details): ToolResult<Details> {
  return { content: [{ type: "text", text: sanitizeText(text) }], details };
}

/**
 * A caller's word as one line, so an echoed newline can't forge a row of the answer.
 *
 * @param value - Optional text from the caller.
 * @returns {string | undefined} The text on one line.
 */
function line(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeLine(value);
}

/**
 * List items without their outer spaces, which no URL carries.
 *
 * @param values - Optional list from the caller.
 * @returns {string[] | undefined} The trimmed items.
 */
function trimmed(values: readonly string[] | undefined): string[] | undefined {
  return values?.map((value) => value.trim());
}

/**
 * Lists the registered sources.
 *
 * @returns {Promise<ToolResult<ProvidersDetails>>} The table and the listings behind it.
 */
export async function providers(): Promise<ToolResult<ProvidersDetails>> {
  const listings = listProviders();
  return answer(formatProviders(listings), { providers: listings });
}

/**
 * One bounded page per source for `urls_discover`.
 *
 * @param params - Validated tool arguments.
 * @param signal - The host's cancel signal.
 * @returns {Promise<ToolResult<DiscoverDetails>>} Source blocks as text, the pages as details.
 */
export async function discover(
  params: Input<Static<typeof discoverSchema>>,
  signal?: AbortSignal,
): Promise<ToolResult<DiscoverDetails>> {
  const domain = sanitizeLine(params.domain);
  const options = {
    limit: params.limit,
    match: trimmed(params.match),
    filter: trimmed(params.filter),
    noScope: params.noScope,
    urlScope: trimmed(params.urlScope),
    urlOutScope: trimmed(params.urlOutScope),
    ext: trimmed(params.ext),
    hasQuery: params.hasQuery,
    from: params.from,
    to: params.to,
    reference: params.reference,
    signal,
  };
  const outcome = await runDiscoverPage(domain, options, line(params.provider));
  if (outcome.mode === "comparison") {
    const comparison = serializeOutcomes(outcome.outcomes);
    return answer(formatDiscoverPages(domain, outcome.outcomes), { comparison });
  }
  const { page, provider: name } = outcome;
  return answer(formatDiscoverPages(domain, [{ provider: name, result: page }]), {
    provider: name,
    ...page,
  });
}
