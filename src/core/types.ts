/** Urls - unified passive URL discovery types */

/** A URL discovered for an input domain by one passive source. */
export interface DiscoveredUrl {
  /** Full URL as found, deduplicated within a single discovery call */
  readonly url: string;
  /** Registry key of the source that produced the URL */
  readonly source: string;
  /** Input domain the URL was discovered for */
  readonly input: string;
  /** Query URL that returned the record, when the source reports it */
  readonly reference?: string;
}

/** Options shared by every discovery call. */
export interface DiscoverOptions {
  /**
   * Stop collecting after this many URLs survive scope, match, and filter rules.
   * When absent, sources run to completion (bounded per-source page safeguards).
   */
  readonly limit?: number;
  /** Keep only URLs containing at least one of these substrings (case-insensitive) */
  readonly match?: readonly string[];
  /** Drop URLs containing any of these substrings (case-insensitive) */
  readonly filter?: readonly string[];
  /** Disable the default host-based scope, keeping every URL a source returns */
  readonly noScope?: boolean;
  /** Abort signal forwarded to in-flight requests */
  readonly signal?: AbortSignal;
}

/** Operations a source can serve; `discover` is the only capability today. */
export interface ProviderCapabilities {
  /** Enumerate URLs for a domain from this passive source */
  readonly discover: boolean;
}

/** Configuration accepted when creating a provider instance. */
export interface ProviderConfig {
  /** Override the source's default public endpoint */
  readonly baseUrl?: string;
  /** API key; falls back to the provider's documented environment variable */
  readonly apiKey?: string;
  /** Request timeout in milliseconds */
  readonly timeout?: number;
}

/**
 * Clamp a caller-provided limit to `[1, max]`; absent limits become `max`.
 *
 * @param limit Caller-provided limit, or undefined.
 * @param max Provider hard maximum.
 * @returns {number} The clamped integer limit.
 */
export function clampMaxResults(limit: number | undefined, max: number): number {
  if (limit === undefined) return max;
  if (!Number.isFinite(limit)) return max;
  return Math.min(Math.max(1, Math.trunc(limit)), max);
}
