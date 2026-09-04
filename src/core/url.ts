/** URL extraction, host normalization, scope, and the shared discovery collector */

import { clampMaxResults, MAX_DISCOVER_RESULTS } from "./types.ts";
import {
  normalizeUrl,
  parseSeenAt,
  parseTimeBound,
  stampInWindow,
  urlExtension,
  urlQueryKeys,
} from "./url-shape.ts";
import type { DiscoverOptions, DiscoveredUrl } from "./types.ts";
import { InvalidInputError } from "./errors.ts";

/**
 * Find full http(s) URLs inside a text blob.
 *
 * The pattern is deliberately conservative: it matches `https?://` followed by non-whitespace
 * and non-quote characters, then trims common trailing punctuation. Sources like the Wayback and
 * Common Crawl CDX dumps return one URL per line; extraction tolerates stray prose around them.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/** Trailing punctuation that is almost never part of a URL. */
const TRAILING_PUNCTUATION = /[),.;:!?\]}]+$/u;

/**
 * Trim a single regex match into a clean URL.
 *
 * @param match Regex match.
 * @returns {string} The trimmed URL.
 */
function cleanUrl(match: string): string {
  let url = match.trim();
  url = url.replace(TRAILING_PUNCTUATION, "");
  return url;
}

/**
 * Extract unique full URLs from a text blob, preserving first-seen order.
 *
 * @param text Source text.
 * @returns {string[]} Unique URLs found in the text.
 */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = cleanUrl(match[0]);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Reduce a bare domain or a full URL to its lowercase hostname.
 *
 * `https://User@www.example.com:8080/path` becomes `www.example.com`; `example.com` stays
 * `example.com`; `www.example.com/path` becomes `www.example.com`. Input that cannot be
 * parsed as a hostname or URL resolves to an empty string. Schemeless userinfo
 * (`example.com@evil.com`) is rejected so WHATWG does not silently take the host after `@`.
 *
 * @param input Bare domain or full URL.
 * @returns {string} The lowercase hostname, or empty when the input is not a host.
 */
export function normalizeHost(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (!trimmed.includes("://") && trimmed.includes("@")) return "";
  if (/^[a-z0-9][a-z0-9-.]*$/i.test(trimmed) && !trimmed.includes("://")) {
    return trimmed.toLowerCase();
  }
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    // Not a hostname and not a parseable URL: no usable host.
    return "";
  }
}

/**
 * Resolve an untrusted URL only when its destination stays on the configured HTTP origin.
 *
 * @param candidate URL returned by a provider.
 * @param baseUrl Configured provider endpoint.
 * @returns {string | undefined} The resolved URL when its origin matches.
 */
export function sameOriginHttpUrl(
  candidate: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!candidate) return undefined;
  try {
    const resolved = new URL(candidate, baseUrl);
    const base = new URL(baseUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return undefined;
    if (resolved.origin !== base.origin) return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

/**
 * Normalize the caller's domain into the hostname used for provider requests.
 *
 * Sources interpolate the target into request paths and queries, so only a derived hostname may
 * reach them: a bare domain passes through, a full URL is reduced to its host, and anything
 * unparseable is rejected before any request is sent.
 *
 * @param domain Bare domain or full URL.
 * @param provider Registry key for the error context.
 * @returns {string} The hostname to use in requests.
 *
 * @throws {InvalidInputError} When the domain is empty or no hostname can be derived.
 */
export function resolveDomain(domain: string, provider: string): string {
  assertDomain(domain, provider);
  const host = canonicalHost(normalizeHost(domain));
  if (!host) {
    throw new InvalidInputError(`invalid domain: ${JSON.stringify(domain)}`, provider);
  }
  return host;
}

/**
 * Keep a hostname only when interpolating it into a request path cannot traverse.
 *
 * WHATWG accepts `.` and `..` as hosts; those collapse `/domain/../` on AlienVault and
 * VirusTotal into a different API path. Empty labels (`foo..bar.com`) are not DNS hosts.
 * A trailing FQDN dot is stripped so `example.com.` and `example.com` hit the same endpoint.
 * Single-label names other than `localhost` (a TLD like `com`) are rejected so a request
 * cannot fan out to every host under that suffix.
 *
 * @param host Hostname from `normalizeHost`.
 * @returns {string} A host safe to interpolate, or empty when it is not usable.
 */
function canonicalHost(host: string): string {
  if (!host) return "";
  if (host.startsWith("[") && host.endsWith("]")) return host.length > 2 ? host : "";
  const trimmed = host.replace(/\.+$/u, "");
  if (!trimmed || trimmed.split(".").some((label) => label.length === 0)) return "";
  if (!trimmed.includes(".") && trimmed !== "localhost") return "";
  return trimmed;
}

/**
 * Reject an empty or whitespace-only domain before any request is sent.
 *
 * @param domain Candidate domain.
 * @param provider Registry key for the error context.
 *
 * @throws {InvalidInputError} When the domain is empty.
 */
export function assertDomain(domain: string, provider: string): void {
  if (!domain.trim()) {
    throw new InvalidInputError("domain is empty", provider);
  }
}

/**
 * Default host-based scope: `www.example.com` belongs to input `example.com`, and
 * `example.com` belongs to itself; `example.com.evil.test` does not. A single-label
 * scope other than `localhost` matches only that exact host, so `com` does not keep
 * every `*.com` URL.
 *
 * @param url URL to test.
 * @param inputDomain Input domain.
 * @returns {boolean} True when the URL's host is the domain or one of its subdomains.
 */
export function inScope(url: string, inputDomain: string): boolean {
  const host = normalizeHost(url);
  if (!host || !inputDomain) return false;
  const domain = normalizeHost(inputDomain);
  if (!domain) return false;
  if (host === domain) return true;
  if (!domain.includes(".") && domain !== "localhost") return false;
  return host.endsWith(`.${domain}`);
}

/**
 * True when `url` falls under one URL-scope pattern.
 *
 * Scope is the URL string, not a hostname or DNS name. A pattern without `*` is a
 * prefix: it matches the URL exactly, or when the URL continues with `/`, `?`, or `#`
 * (or the pattern already ends with `/`). A pattern with `*` is a glob over the whole
 * URL (`*` = any characters, including none). Matching is case-insensitive.
 *
 * @param url Full URL.
 * @param pattern URL prefix or glob.
 * @returns {boolean} True when the URL is in that pattern.
 */
export function urlMatchesScope(url: string, pattern: string): boolean {
  const target = url.trim().toLowerCase();
  const spec = pattern.trim().toLowerCase();
  if (!target || !spec) return false;
  if (spec.includes("*")) return globMatch(target, spec);
  return isUrlPrefix(target, spec);
}

/**
 * Prefix match with a path/query/fragment boundary so `.../api` does not keep `.../apiv2`.
 *
 * @param url Lowercased URL.
 * @param prefix Lowercased prefix.
 * @returns {boolean} True when url is prefix or continues at a URL boundary.
 */
function isUrlPrefix(url: string, prefix: string): boolean {
  if (url === prefix) return true;
  if (!url.startsWith(prefix)) return false;
  if (prefix.endsWith("/")) return true;
  const next = url.charAt(prefix.length);
  return next === "/" || next === "?" || next === "#";
}

/**
 * Glob match with only `*` as a wildcard. Split-and-scan, not a regex, so a hostile
 * pattern cannot explode into nested quantifiers.
 *
 * @param text Lowercased URL.
 * @param pattern Lowercased glob.
 * @returns {boolean} True when the glob matches the whole text.
 */
function globMatch(text: string, pattern: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return text === (parts[0] ?? "");
  return globAnchored(text, parts);
}

/**
 * Match a multi-part glob after the first `*` has been seen.
 *
 * @param text Lowercased URL.
 * @param parts Pattern split on `*`.
 * @returns {boolean} True when anchors and middle pieces fit.
 */
function globAnchored(text: string, parts: readonly string[]): boolean {
  const first = parts[0] ?? "";
  const last = parts.at(-1) ?? "";
  if (first && !text.startsWith(first)) return false;
  if (last && !text.endsWith(last)) return false;
  const end = last ? text.length - last.length : text.length;
  return globMiddle(text, parts.slice(1, -1), first.length, end);
}

/**
 * Advance through interior glob pieces between the start and end anchors.
 *
 * @param text Lowercased URL.
 * @param middle Interior pieces (may include empty strings from `**`).
 * @param start Index after the prefix.
 * @param end Index where the suffix begins.
 * @returns {boolean} True when every piece appears in order before `end`.
 */
function globMiddle(text: string, middle: readonly string[], start: number, end: number): boolean {
  let pos = start;
  for (const part of middle) {
    if (!part) continue;
    const found = text.indexOf(part, pos);
    if (found === -1 || found + part.length > end) return false;
    pos = found + part.length;
  }
  return pos <= end;
}

/**
 * Shared per-call collector used by every source.
 *
 * Applies scope, match, and filter rules once per URL, deduplicates, and stops a source the
 * moment the requested limit is reached. Sources page over their backend and check `done`
 * between pages; one implementation, instead of duplicating the rule logic per provider.
 */
interface CollectorRules {
  readonly match: string[] | undefined;
  readonly filter: string[] | undefined;
  readonly noScope: boolean;
  readonly urlScope: readonly string[] | undefined;
  readonly urlOutScope: readonly string[] | undefined;
  readonly ext: string[] | undefined;
  readonly hasQuery: boolean | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly limit: number | undefined;
}

/**
 * Normalize collector options once so the constructor stays a straight assignment.
 *
 * @param options Caller discovery options.
 * @returns {CollectorRules} Normalized keep/drop rules.
 */
function collectorRules(options: DiscoverOptions | undefined): CollectorRules {
  if (!options) {
    return {
      match: undefined,
      filter: undefined,
      noScope: false,
      urlScope: undefined,
      urlOutScope: undefined,
      ext: undefined,
      hasQuery: undefined,
      from: undefined,
      to: undefined,
      limit: undefined,
    };
  }
  return {
    match: lowercaseAll(options.match),
    filter: lowercaseAll(options.filter),
    noScope: options.noScope === true,
    urlScope: options.urlScope,
    urlOutScope: options.urlOutScope,
    ext: lowercaseAll(options.ext),
    hasQuery: options.hasQuery,
    from: collectorTimeBound(options.from, "from"),
    to: collectorTimeBound(options.to, "to"),
    limit: clampOptionalLimit(options.limit),
  };
}

/**
 * Parse a supplied time bound or reject it before provider I/O.
 *
 * @param value Caller time bound.
 * @param edge Start or end of the window.
 * @returns {string | undefined} Comparable archive stamp, or undefined when absent.
 * @throws {InvalidInputError} When a supplied bound is invalid.
 */
function collectorTimeBound(value: string | undefined, edge: "from" | "to"): string | undefined {
  if (value === undefined) return undefined;
  const bound = parseTimeBound(value, edge);
  if (!bound) throw new InvalidInputError(`invalid ${edge} bound: ${JSON.stringify(value)}`);
  return bound;
}

/**
 * Lowercase every pattern, or leave the list absent.
 *
 * @param values Caller patterns.
 * @returns {string[] | undefined} Lowercased patterns.
 */
function lowercaseAll(values: readonly string[] | undefined): string[] | undefined {
  return values?.map((value) => value.toLowerCase());
}

/**
 * Clamp a provided limit; absent stays unbounded.
 *
 * @param limit Caller limit.
 * @returns {number | undefined} Clamped limit, or undefined when none was set.
 */
function clampOptionalLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  return clampMaxResults(limit, MAX_DISCOVER_RESULTS);
}

export class UrlCollector {
  private readonly urls: DiscoveredUrl[] = [];
  private readonly seen = new Map<string, number>();
  private readonly match: string[] | undefined;
  private readonly filter: string[] | undefined;
  private readonly noScope: boolean;
  private readonly urlScope: readonly string[] | undefined;
  private readonly urlOutScope: readonly string[] | undefined;
  private readonly ext: string[] | undefined;
  private readonly hasQuery: boolean | undefined;
  private readonly from: string | undefined;
  private readonly to: string | undefined;
  private readonly limit: number | undefined;
  private readonly input: string;

  constructor(options: DiscoverOptions | undefined, input: string) {
    const rules = collectorRules(options);
    this.match = rules.match;
    this.filter = rules.filter;
    this.noScope = rules.noScope;
    this.urlScope = rules.urlScope;
    this.urlOutScope = rules.urlOutScope;
    this.ext = rules.ext;
    this.hasQuery = rules.hasQuery;
    this.from = rules.from;
    this.to = rules.to;
    this.limit = rules.limit;
    this.input = input;
  }

  /**
   * True when the configured limit has been reached.
   *
   * @returns {boolean} Whether the limit is reached.
   */
  get done(): boolean {
    return this.limit !== undefined && this.urls.length >= this.limit;
  }

  /**
   * Number of URLs collected so far.
   *
   * @returns {number} The collected count.
   */
  get count(): number {
    return this.urls.length;
  }

  /**
   * Collected URLs in insertion order.
   *
   * @returns {DiscoveredUrl[]} Collected URLs.
   */
  get results(): DiscoveredUrl[] {
    return this.urls;
  }

  /**
   * Consider one extracted URL; returns true when the URL was newly kept.
   *
   * Dedup uses {@link normalizeUrl}. A later occurrence of the same normalized URL updates
   * `firstSeen` / `lastSeen` and is not counted again.
   *
   * @param source Registry key reporting the URL
   * @param url Full URL string
   * @param reference Query URL that returned the record, when known
   * @param seenAt Archive timestamp or ISO instant for this occurrence
   * @returns {boolean} True when the URL was newly kept.
   */
  push(source: string, url: string, reference?: string, seenAt?: string): boolean {
    const seen = parseSeenAt(seenAt);
    if (!stampInWindow(seen?.stamp, this.from, this.to)) return false;
    const key = normalizeUrl(url);
    const existing = this.seen.get(key);
    if (existing !== undefined) {
      this.mergeSeen(existing, seen?.iso);
      return false;
    }
    if (this.done || !this.accepts(url)) return false;
    this.seen.set(key, this.urls.length);
    this.urls.push(this.record(source, url, reference, seen?.iso));
    return true;
  }

  /**
   * Apply host filter, URL-scope, extension, query, and substring match/filter.
   *
   * @param url Candidate URL.
   * @returns {boolean} True when the URL should be kept.
   */
  private accepts(url: string): boolean {
    if (!this.noScope && !inScope(url, this.input)) return false;
    if (!keptByUrlScope(url, this.urlScope)) return false;
    if (droppedByUrlOutScope(url, this.urlOutScope)) return false;
    if (!this.matchesExt(url) || !this.matchesQuery(url)) return false;
    const lower = url.toLowerCase();
    return !isFilteredOut(lower, this.filter) && matchesAny(lower, this.match);
  }

  /**
   * Keep when no extension filter is set, otherwise when the path extension is listed.
   *
   * @param url Candidate URL.
   * @returns {boolean} True when the extension filter passes.
   */
  private matchesExt(url: string): boolean {
    if (!this.ext || this.ext.length === 0) return true;
    const ext = urlExtension(url);
    return ext !== undefined && this.ext.includes(ext);
  }

  /**
   * Keep according to `hasQuery` after tracking keys are dropped.
   *
   * @param url Candidate URL.
   * @returns {boolean} True when the query filter passes.
   */
  private matchesQuery(url: string): boolean {
    if (this.hasQuery === undefined) return true;
    const has = urlQueryKeys(url).length > 0;
    return this.hasQuery === has;
  }

  /**
   * Widen first/last seen on an already collected URL.
   *
   * @param index Index in `urls`.
   * @param iso New occurrence instant.
   */
  private mergeSeen(index: number, iso: string | undefined): void {
    if (!iso) return;
    const current = this.urls[index];
    if (!current) return;
    const firstSeen = current.firstSeen && current.firstSeen < iso ? current.firstSeen : iso;
    const lastSeen = current.lastSeen && current.lastSeen > iso ? current.lastSeen : iso;
    this.urls[index] = { ...current, firstSeen, lastSeen };
  }

  /**
   * Build a result record, omitting empty optional fields.
   *
   * @param source Registry key.
   * @param url Original URL.
   * @param reference Query URL.
   * @param iso Seen-at instant.
   * @returns {DiscoveredUrl} The stored record.
   */
  private record(
    source: string,
    url: string,
    reference: string | undefined,
    iso: string | undefined,
  ): DiscoveredUrl {
    const ext = urlExtension(url);
    const queryKeys = urlQueryKeys(url);
    return {
      url,
      source,
      input: this.input,
      ...(reference ? { reference } : {}),
      ...(ext ? { ext } : {}),
      ...(queryKeys.length > 0 ? { queryKeys } : {}),
      ...(iso ? { firstSeen: iso, lastSeen: iso } : {}),
    };
  }
}

/**
 * Check whether a URL hits the exclude patterns.
 *
 * @param lower Lowercased URL.
 * @param filter Exclude patterns.
 * @returns {boolean} True when any pattern matches.
 */
function isFilteredOut(lower: string, filter: readonly string[] | undefined): boolean {
  return filter !== undefined && filter.some((value) => lower.includes(value));
}

/**
 * Check whether a URL hits the keep patterns, or matches when there are none.
 *
 * @param lower Lowercased URL.
 * @param match Keep patterns.
 * @returns {boolean} True when the URL should be kept.
 */
function matchesAny(lower: string, match: readonly string[] | undefined): boolean {
  if (!match || match.length === 0) return true;
  return match.some((value) => lower.includes(value));
}

/**
 * Keep when no URL-scope patterns are set, otherwise when any pattern matches.
 *
 * @param url Full URL.
 * @param patterns URL-scope patterns.
 * @returns {boolean} True when the URL survives URL-scope.
 */
function keptByUrlScope(url: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((pattern) => urlMatchesScope(url, pattern));
}

/**
 * Drop when any URL-out-scope pattern matches.
 *
 * @param url Full URL.
 * @param patterns URL-out-scope patterns.
 * @returns {boolean} True when the URL is out of URL-scope.
 */
function droppedByUrlOutScope(url: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => urlMatchesScope(url, pattern));
}
