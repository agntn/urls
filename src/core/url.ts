/** URL extraction, host normalization, scope, and the shared discovery collector */

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
 * parsed as a hostname or URL resolves to an empty string.
 *
 * @param input Bare domain or full URL.
 * @returns {string} The lowercase hostname, or empty when the input is not a host.
 */
export function normalizeHost(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
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
  const host = normalizeHost(domain);
  if (!host) {
    throw new InvalidInputError(`invalid domain: ${JSON.stringify(domain)}`, provider);
  }
  return host;
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
 * `example.com` belongs to itself; `example.com.evil.test` does not.
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
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Shared per-call collector used by every source.
 *
 * Applies scope, match, and filter rules once per URL, deduplicates, and stops a source the
 * moment the requested limit is reached. Sources page over their backend and check `done`
 * between pages; one implementation, instead of duplicating the rule logic per provider.
 */
export class UrlCollector {
  private readonly urls: DiscoveredUrl[] = [];
  private readonly seen = new Set<string>();
  private readonly match: string[] | undefined;
  private readonly filter: string[] | undefined;
  private readonly noScope: boolean;
  private readonly limit: number | undefined;
  private readonly input: string;

  constructor(options: DiscoverOptions | undefined, input: string) {
    this.match = options?.match?.map((value) => value.toLowerCase());
    this.filter = options?.filter?.map((value) => value.toLowerCase());
    this.noScope = options?.noScope ?? false;
    this.limit = options?.limit;
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
   * Consider one extracted URL; returns true when the URL was kept.
   *
   * @param source Registry key reporting the URL
   * @param url Full URL string
   * @param reference Query URL that returned the record, when known
   * @returns {boolean} True when the URL was kept.
   */
  push(source: string, url: string, reference?: string): boolean {
    if (this.done || this.seen.has(url)) return false;
    if (!this.noScope && !inScope(url, this.input)) return false;

    const lower = url.toLowerCase();
    if (isFilteredOut(lower, this.filter)) return false;
    if (!matchesAny(lower, this.match)) return false;

    this.seen.add(url);
    this.urls.push({ url, source, input: this.input, ...(reference ? { reference } : {}) });
    return true;
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
