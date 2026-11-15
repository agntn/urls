/**
 * Wayback Machine provider - the CDX search API
 *
 * No API key. One text query returns the set of original URLs captured for the domain and its
 * subdomains. The endpoint is the same one the Wayback website uses; heavy bulk dumps belong on
 * an on-premise CDX server passed through `baseUrl`.
 *
 * Verified 2026-09-02: the `collapse=urlkey` variant of this query times out from the
 * development network (HTTP 000), while the plain text query answers instantly; exact-URL
 * deduplication happens in the shared collector instead.
 *
 * Verified 2026-09-19: `url=domain/*` is a prefix match on the apex host (`www.` folded in by
 * the urlkey), so subdomains never came back; `matchType=domain` covers them, like the
 * `*.domain/*` shorthand urlfinder sends.
 *
 * Verified 2026-11-15: `matchType=prefix` folds the asked URL the same way as the urlkey
 * (scheme, `www.`, case and a trailing `/` dropped), so a `urlScope` prefix asks for a superset
 * of what it keeps. `agntn.dev/` came back as 259 KB in 13 s, the whole domain as 9.2 MB in 47 s.
 *
 * API: https://web.archive.org/cdx/search/cdx (REST, text lines)
 */

import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "../core/types.ts";
import { Provider } from "../core/provider.ts";
import { buildQuery } from "../core/client.ts";
import { UrlCollector, extractUrls, inScope, resolveDomain } from "../core/url.ts";
import { parseCdxTextLine } from "../core/url-shape.ts";

/** More prefixes than this cost more round trips than one domain-wide stream. */
const MAX_SCOPE_REQUESTS = 8;

/** Empty and dot segments, which the archive would not keep as written. */
const UNSAFE_PATH = /\/\/|\/\.{1,2}(?:\/|$)/u;

/** Host, then an optional path the urlkey keeps as written: no query, port or escapes. */
const SCOPE_PREFIX = /^https?:\/\/([a-z0-9.-]+)(\/[a-z0-9._~/-]*)?$/u;

/**
 * The part of a URL-scope pattern every kept URL starts with, cut where the host is whole.
 *
 * @param pattern Lowercased `urlScope` pattern.
 * @returns {string} Literal head, or empty when a glob cuts the host short.
 */
function literalHead(pattern: string): string {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern;
  const head = pattern.slice(0, star);
  return head.slice(head.indexOf("//") + 2).includes("/") ? head : "";
}

/**
 * Turn one URL-scope pattern into a CDX prefix under the target domain.
 *
 * @param pattern `urlScope` pattern.
 * @param target Resolved domain.
 * @returns {string | undefined} `host/path` for `matchType=prefix`, or undefined to ask broadly.
 */
function scopePrefix(pattern: string, target: string): string | undefined {
  const match = SCOPE_PREFIX.exec(literalHead(pattern.trim().toLowerCase()));
  const host = match?.[1];
  const path = match?.[2] ?? "/";
  if (!host || host.split(".").includes("") || UNSAFE_PATH.test(path)) return undefined;
  if (!inScope(`https://${host}/`, target)) return undefined;
  return `${host.replace(/^www\./u, "")}${path}`;
}

/**
 * CDX `url` values that together cover every URL the scope can keep.
 *
 * @param target Resolved domain.
 * @param urlScope Caller `urlScope` patterns.
 * @returns {string[] | undefined} Prefixes to ask for, or undefined for one domain-wide request.
 */
function scopePrefixes(
  target: string,
  urlScope: readonly string[] | undefined,
): string[] | undefined {
  if (!urlScope || urlScope.length === 0) return undefined;
  const prefixes = new Set<string>();
  for (const pattern of urlScope) {
    const prefix = scopePrefix(pattern, target);
    if (prefix === undefined) return undefined;
    prefixes.add(prefix);
  }
  const sorted = [...prefixes].toSorted();
  const kept = sorted.filter(
    (prefix, index) => !sorted.slice(0, index).some((other) => prefix.startsWith(other)),
  );
  return kept.length > MAX_SCOPE_REQUESTS ? undefined : kept;
}

export class Wayback extends Provider {
  static readonly key = "wayback";

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://web.archive.org";
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "wayback");
    const collector = new UrlCollector(options, domain);
    const prefixes = scopePrefixes(target, options?.urlScope);
    const queries = prefixes
      ? prefixes.map((url) => ({ url, matchType: "prefix" }))
      : [{ url: target, matchType: "domain" }];

    for (const query of queries) {
      if (collector.done) break;
      await this.#collect(query, collector, options?.signal);
    }

    return collector.results;
  }

  /**
   * Stream one CDX query into the collector.
   *
   * @param query `url` and `matchType` of the request.
   * @param query.url CDX `url` parameter.
   * @param query.matchType CDX `matchType` parameter.
   * @param collector Shared per-call collector.
   * @param signal Caller abort signal.
   */
  async #collect(
    query: Readonly<{ url: string; matchType: string }>,
    collector: UrlCollector,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const apiURL = `${this.baseUrl}/cdx/search/cdx${buildQuery({
      ...query,
      output: "txt",
      fl: "original,timestamp",
    })}`;

    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "text/plain, */*" },
      signal,
    })) {
      if (collector.done) break;
      const parsed = parseCdxTextLine(line);
      if (!parsed) continue;
      for (const extracted of extractUrls(parsed.url)) {
        collector.push(this.name, extracted, apiURL, parsed.timestamp);
      }
    }
  }
}
