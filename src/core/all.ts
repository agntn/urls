/** Parallel fan-out over every registered provider, for side-by-side comparison. */

import type { Provider } from "./provider.ts";
import type { DiscoverOptions, DiscoveredUrl } from "./types.ts";
import {
  AuthError,
  PaymentError,
  RateLimitError,
  UnsupportedOperationError,
  UrlsError,
  normalizeError,
} from "./errors.ts";
import { requireOperation } from "./provider.ts";
import { create, providers } from "./registry.ts";
import { resolveProvider } from "./resolve.ts";

/**
 * One provider's contribution to a comparison: either its result or its normalized failure.
 *
 * Failures stay in the list on purpose - a provider that needs a missing API key is itself
 * useful signal when comparing sources.
 */
export type ProviderOutcome<T> =
  | { readonly provider: string; readonly result: T; readonly error?: never }
  | { readonly provider: string; readonly error: UrlsError; readonly result?: never };

/** JSON-safe view of outcomes: errors reduced to their messages. */
export interface SerializedOutcome<T> {
  readonly provider: string;
  readonly result?: T;
  readonly error?: string;
}

/**
 * Run one operation on every registered provider in parallel.
 *
 * A caller abort rejects the whole fan-out with the caller's reason instead of landing as one
 * failure per provider.
 *
 * @param run Operation to run per provider.
 * @param signal Caller cancellation, when provided.
 * @returns {Promise<ProviderOutcome<T>[]>} Per-provider outcomes.
 */
async function runAll<T>(
  run: (provider: Provider) => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<ProviderOutcome<T>[]> {
  return Promise.all(
    providers().map(async (name): Promise<ProviderOutcome<T>> => {
      try {
        return { provider: name, result: await run(await create(name)) };
      } catch (error) {
        signal?.throwIfAborted();
        return { provider: name, error: normalizeError(error, name) };
      }
    }),
  );
}

/**
 * Discover URLs for one domain on every registered provider in parallel.
 *
 * @param domain Target domain.
 * @param options Discovery options shared by every source.
 * @returns {Promise<ProviderOutcome<DiscoveredUrl[]>[]>} Per-provider outcomes, results or normalized failures.
 */
export function discoverAll(
  domain: string,
  options?: Readonly<DiscoverOptions>,
): Promise<ProviderOutcome<DiscoveredUrl[]>[]> {
  return runAll(
    (provider) => requireOperation(provider, "discover")(domain, options),
    options?.signal,
  );
}

/**
 * Reduce outcomes to a JSON-safe shape for MCP and AI tool results.
 *
 * @param outcomes Per-provider outcomes.
 * @returns {SerializedOutcome<T>[]} Outcomes with errors reduced to messages.
 */
export function serializeOutcomes<T>(
  outcomes: readonly ProviderOutcome<T>[],
): SerializedOutcome<T>[] {
  return outcomes.map((outcome) =>
    outcome.error
      ? { provider: outcome.provider, error: outcome.error.message }
      : { provider: outcome.provider, result: outcome.result },
  );
}

/**
 * A failure worth falling past: missing or rejected credentials, billing, or a rate limit.
 *
 * @param error Normalized failure.
 * @returns {boolean} True when the failure is about access rather than the request.
 */
function isSkippable(error: UrlsError): boolean {
  return (
    error instanceof AuthError ||
    error instanceof PaymentError ||
    error instanceof RateLimitError ||
    error instanceof UnsupportedOperationError
  );
}

/**
 * Run one operation on the auto-selected provider, falling past providers whose failure is
 * about access rather than the request: missing keys, billing, rate limits, and unsupported
 * operations. Anything else (bad input, transport) propagates immediately, and when every
 * provider is skipped the first skip reason is thrown - that is the error of the provider
 * auto-selection actually picked. A caller abort ends the chain with the caller's reason.
 *
 * @param run The operation to run on each candidate provider.
 * @param signal Caller cancellation, when provided.
 * @returns {Promise<{ provider: string; result: T }>} The first successful provider name and result.
 */
async function runWithFallback<T>(
  run: (provider: Provider) => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<{ provider: string; result: T }> {
  const candidates = [...new Set([resolveProvider(), ...providers()])];
  let firstSkipped: UrlsError | undefined;
  for (const name of candidates) {
    try {
      const provider = await create(name);
      return { provider: name, result: await run(provider) };
    } catch (error) {
      signal?.throwIfAborted();
      const normalized = normalizeError(error, name);
      if (!isSkippable(normalized)) throw normalized;
      firstSkipped ??= normalized;
    }
  }
  throw firstSkipped ?? new UrlsError("No provider is registered");
}

/**
 * Discover on the auto-selected provider, falling past auth, billing, and rate-limit failures.
 *
 * @param domain Target domain.
 * @param options Discovery options shared by every source.
 * @returns {Promise<{ provider: string; result: DiscoveredUrl[] }>} The selected provider name and its discovered URLs.
 */
export function discoverWithFallback(
  domain: string,
  options?: Readonly<DiscoverOptions>,
): Promise<{ provider: string; result: DiscoveredUrl[] }> {
  return runWithFallback(
    (provider) => requireOperation(provider, "discover")(domain, options),
    options?.signal,
  );
}
