import type { H3Event } from "h3";
import { hash } from "ohash";

type Query = Record<string, unknown>;

export interface RequestAbort {
  readonly signal: AbortSignal;
  dispose(): void;
}

/** Combines a client disconnect with an optional deadline for the whole operation. */
export function requestAbort(event: H3Event, timeout?: number): RequestAbort {
  const controller = new AbortController();
  const webSignal = event.web?.request?.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  /** A 499 so the error log, which keeps 5xx only, doesn't count a closed tab as a failure. */
  const disconnected = () => abort(createError({ statusCode: 499, statusMessage: "The client disconnected" }));
  const abortFromWeb = disconnected;
  const abortFromNode = disconnected;

  if (webSignal) {
    if (webSignal.aborted) abortFromWeb();
    else webSignal.addEventListener("abort", abortFromWeb, { once: true });
  } else {
    event.node.req.once("aborted", abortFromNode);
    event.node.res.once("close", abortFromNode);
  }
  if (timeout !== undefined) {
    timer = setTimeout(
      () => abort(new DOMException("The discovery request timed out", "TimeoutError")),
      timeout,
    );
  }

  return {
    signal: controller.signal,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      webSignal?.removeEventListener("abort", abortFromWeb);
      if (!webSignal) {
        event.node.req.off("aborted", abortFromNode);
        event.node.res.off("close", abortFromNode);
      }
    },
  };
}

/** Caps every public parameter well below the library's own ceilings. */
export const LIMITS = {
  domain: 253,
  parameter: 256,
  /** Items in one list parameter such as `match` or `ext`. */
  list: 16,
  /** URLs per source; the agent default is 100, the worker keeps to it. */
  urls: 100,
  /** Whole request, every source included; Wayback on a busy domain streams for a while. */
  timeout: 45_000,
} as const;

function raw(query: Query, key: string): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export function readString(query: Query, key: string, max: number): string | undefined {
  const value = raw(query, key)?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > max) {
    throw createError({ statusCode: 400, statusMessage: `${key} must be at most ${max} characters` });
  }
  return value;
}

export function requireString(query: Query, key: string, max: number): string {
  const value = readString(query, key, max);
  if (!value) {
    throw createError({ statusCode: 400, statusMessage: `${key} is required` });
  }
  return value;
}

export function readInt(query: Query, key: string, min: number, max: number): number | undefined {
  const value = raw(query, key);
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createError({ statusCode: 400, statusMessage: `${key} must be an integer between ${min} and ${max}` });
  }
  return parsed;
}

export function readBoolean(query: Query, key: string): boolean | undefined {
  const value = raw(query, key);
  if (value === undefined) {
    return undefined;
  }
  return value === "true" || value === "1";
}

/** A comma separated list, trimmed, empties dropped; undefined when nothing is left. */
export function readList(query: Query, key: string): string[] | undefined {
  const value = readString(query, key, LIMITS.parameter);
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items?.length) {
    return undefined;
  }
  if (items.length > LIMITS.list) {
    throw createError({ statusCode: 400, statusMessage: `${key} takes at most ${LIMITS.list} items` });
  }
  return items;
}

/** Stable cache key from the parameters that reach the library, so two spellings of one query share an entry. */
export function cacheKey(prefix: string, params: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}:${JSON.stringify(entries)}`;
}

/** Turns a library error into the 4xx the browser can show. */
export function toHttpError(error: unknown): never {
  if (error && typeof error === "object" && "statusCode" in error) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  throw createError({ statusCode: 400, statusMessage: message.slice(0, 300) });
}

export function markPublic(event: H3Event, seconds: number): void {
  setResponseHeader(event, "Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
}

/** Uncached discovery requests one client may start per minute; `ratelimits` in wrangler.jsonc carries the same number. */
export const RATE_LIMIT = 20;

/** The Workers Rate Limiting binding: Cloudflare keeps the count, so concurrent misses can't race it. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Fallback for `nuxt dev` without the binding: one counter per isolate, incremented synchronously. */
const localCounts = new Map<string, number>();

/**
 * The address a request came from, as Cloudflare saw it. `X-Forwarded-For` is left out: its first
 * entry is whatever the caller sent, so it would let one client rotate its own key.
 *
 * @param {H3Event} event - The request.
 * @returns {string} The client address, or `unknown`.
 */
function clientAddress(event: H3Event): string {
  return getRequestHeader(event, "cf-connecting-ip") ?? getRequestIP(event) ?? "unknown";
}

/**
 * Refuses a discovery request past the per-minute limit for its address. Only a cache miss
 * counts, so the sources behind the worker see at most this many new questions from one address.
 *
 * @param {H3Event} event - The request.
 */
export async function assertRateLimit(event: H3Event): Promise<void> {
  const key = hash(clientAddress(event));
  const limiter = (event.context.cloudflare?.env as { DISCOVER_LIMIT?: RateLimiter } | undefined)?.DISCOVER_LIMIT;
  let allowed: boolean;
  if (limiter) {
    allowed = (await limiter.limit({ key })).success;
  } else {
    const slot = `${key}:${Math.floor(Date.now() / 60_000)}`;
    const count = (localCounts.get(slot) ?? 0) + 1;
    localCounts.set(slot, count);
    allowed = count <= RATE_LIMIT;
  }
  if (!allowed) {
    setResponseHeader(event, "Retry-After", 60);
    throw createError({
      statusCode: 429,
      statusMessage: `More than ${RATE_LIMIT} new discovery requests in a minute from one address. Cached answers don't count, so wait a moment or repeat an earlier query.`,
    });
  }
}

/** How long an answer with a failed provider stays cached; long enough to absorb a burst, short enough to forget an outage. */
export const DEGRADED_TTL = 60 * 5;

interface CachedEntry<T> {
  value: T;
  expires: number;
}

/**
 * Serves an answer from the cache or produces and stores it.
 *
 * A produced answer that carries a provider failure is kept for {@link DEGRADED_TTL}
 * only, so a transient outage never pins a bad listing for the full window, and a
 * thrown failure is not stored at all. The key is the exact parameter set: URL patterns
 * are case sensitive, so nothing is lowercased on the way in.
 */
export async function cachedAnswer<T>(
  event: H3Event,
  prefix: string,
  params: Readonly<Record<string, unknown>>,
  ttl: number,
  produce: () => Promise<{ value: T; degraded: boolean }>,
): Promise<T> {
  const storage = useStorage("cache");
  const key = `docs:${prefix}:${hash(cacheKey(prefix, params))}`;
  const hit = await storage.getItem<CachedEntry<T>>(key).catch(() => null);
  if (hit && typeof hit.expires === "number" && hit.expires > Date.now()) {
    markPublic(event, Math.max(1, Math.floor((hit.expires - Date.now()) / 1000)));
    return hit.value;
  }
  await assertRateLimit(event);
  const { value, degraded } = await produce();
  const seconds = degraded ? DEGRADED_TTL : ttl;
  await storage.setItem(key, { value, expires: Date.now() + seconds * 1000 }).catch(() => undefined);
  markPublic(event, seconds);
  return value;
}
