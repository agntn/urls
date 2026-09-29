import {
  InvalidInputError,
  isAllProviders,
  providers,
  runDiscoverPage,
  UnknownProviderError,
  type DiscoverPage,
  type DiscoverPageOptions,
  type SerializedOutcome,
} from "@agntn/urls";
import type { DiscoverAnswer } from "../../shared/types/discover";

/** A clean answer stays six hours; the sources behind it move slowly. */
const TTL = 60 * 60 * 6;

/** One source's share of the request; a slow one fails alone instead of sinking the comparison. */
const SOURCE_TIMEOUT = 35_000;

/**
 * The comparison `urls_discover` builds with `provider: "all"`, run as one executor call per
 * source so each gets its own deadline. Same shape as `serializeOutcomes`.
 *
 * @param {string} domain - The domain to ask about.
 * @param {DiscoverPageOptions} options - Shared options, the caller's signal included.
 * @returns {Promise<SerializedOutcome<DiscoverPage>[]>} One page or one error message per source.
 */
async function compare(domain: string, options: DiscoverPageOptions): Promise<SerializedOutcome<DiscoverPage>[]> {
  return Promise.all(
    providers().map(async (key): Promise<SerializedOutcome<DiscoverPage>> => {
      const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(SOURCE_TIMEOUT)]);
      try {
        const outcome = await runDiscoverPage(domain, { ...options, signal }, key);
        return outcome.mode === "single" ? { provider: key, result: outcome.page } : { provider: key, error: "unexpected comparison" };
      } catch (error) {
        options.signal?.throwIfAborted();
        if (error instanceof InvalidInputError) throw error;
        return { provider: key, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

/**
 * One `urls_discover` call through the executor the MCP server uses, so the page shows what an
 * agent would get, text included. `provider` is a registry key or `all`.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const provider = readString(query, "provider", LIMITS.parameter) ?? "all";
  const params = {
    domain: requireString(query, "domain", LIMITS.domain),
    provider,
    limit: readInt(query, "limit", 1, LIMITS.urls) ?? LIMITS.urls,
    match: readList(query, "match"),
    filter: readList(query, "filter"),
    ext: readList(query, "ext"),
    urlScope: readList(query, "urlScope"),
    urlOutScope: readList(query, "urlOutScope"),
    hasQuery: readBoolean(query, "hasQuery"),
    noScope: readBoolean(query, "noScope"),
    from: readString(query, "from", LIMITS.parameter),
    to: readString(query, "to", LIMITS.parameter),
  };
  try {
    return await cachedAnswer<DiscoverAnswer>(event, "discover", params, TTL, async () => {
      const abort = requestAbort(event, LIMITS.timeout);
      try {
        const { domain, provider: key, ...rest } = params;
        const options: DiscoverPageOptions = { ...rest, signal: abort.signal };
        const fetchedAt = new Date().toISOString();
        if (isAllProviders(key)) {
          const outcomes = await compare(domain, options);
          const value: DiscoverAnswer = { mode: "comparison", text: JSON.stringify(outcomes, null, 2), outcomes, fetchedAt };
          return { value, degraded: outcomes.some((entry) => entry.error !== undefined) };
        }
        const outcome = await runDiscoverPage(domain, options, key);
        if (outcome.mode === "single") {
          const value: DiscoverAnswer = {
            mode: "single",
            text: JSON.stringify({ provider: outcome.provider, ...outcome.page }, null, 2),
            provider: outcome.provider,
            page: outcome.page,
            fetchedAt,
          };
          return { value, degraded: false };
        }
        throw createError({ statusCode: 500, statusMessage: "A named source answered with a comparison" });
      } finally {
        abort.dispose();
      }
    });
  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof UnknownProviderError) {
      return toHttpError(error);
    }
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    /** A source that failed on its own (network, rate limit, missing key) is the upstream's answer, not the caller's mistake. */
    const message = error instanceof Error ? error.message : String(error);
    throw createError({ statusCode: 502, statusMessage: message.slice(0, 300) });
  }
});
