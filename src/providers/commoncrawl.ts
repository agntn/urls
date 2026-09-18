/**
 * Common Crawl provider - the index CDX API
 *
 * No API key. Resolves the newest index per calendar year for the last five years and queries
 * each CDX endpoint for `*.domain`. One failing index (the frontend returns intermittent
 * 502/504s) is skipped while the others still run.
 *
 * Verified 2026-09-02: `index.commoncrawl.org` unreachable (connection refused) from the
 * development network, so live checks are skipped there; the provider keeps its contract and is
 * exercised through mocked HTTP in unit tests.
 *
 * API: https://index.commoncrawl.org/collinfo.json (+ per-index CDX)
 */

import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "../core/types.ts";
import { Provider } from "../core/provider.ts";
import { UrlCollector, extractUrls, resolveDomain, sameOriginHttpUrl } from "../core/url.ts";
import { parseCdxTextLine } from "../core/url-shape.ts";

/** Number of calendar years covered, newest first. */
const MAX_YEARS_BACK = 5;

interface CommonCrawlIndex {
  readonly id?: string;
  readonly "cdx-api"?: string;
}

/**
 * Calendar years covered, newest first.
 *
 * @returns {string[]} The last five years as strings.
 */
function recentYears(): string[] {
  const year = new Date().getFullYear();
  return Array.from({ length: MAX_YEARS_BACK }, (_, i) => String(year - i));
}

/**
 * One CDX endpoint per year, first index whose id names the year; deterministic order.
 *
 * @param indexes Indexes from `collinfo.json`.
 * @param years Calendar years to cover.
 * @param baseUrl Configured index server used as the allowed origin.
 * @returns {Map<string, string>} Map of year to CDX API URL.
 */
function mapIndexesPerYear(
  indexes: readonly CommonCrawlIndex[],
  years: readonly string[],
  baseUrl: string,
): Map<string, string> {
  const byYear = new Map<string, string>();
  for (const candidate of years) {
    for (const index of indexes) {
      const api = sameOriginHttpUrl(index["cdx-api"], baseUrl);
      if (api && index.id?.includes(candidate) && !byYear.has(candidate)) {
        byYear.set(candidate, api);
        break;
      }
    }
  }
  return byYear;
}

export class CommonCrawl extends Provider {
  static readonly key = "commoncrawl";

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://index.commoncrawl.org";
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "commoncrawl");
    const collector = new UrlCollector(options, domain);
    const signal = options?.signal;

    const indexes = await this.getJSON<CommonCrawlIndex[]>(`${this.baseUrl}/collinfo.json`, {
      signal,
    });
    const years = recentYears();
    const byYear = mapIndexesPerYear(indexes ?? [], years, this.baseUrl);

    for (const candidate of years) {
      if (shouldStop(collector, signal)) break;
      const cdxApi = byYear.get(candidate);
      if (!cdxApi) continue;
      try {
        await this.queryIndex(cdxApi, target, collector, signal);
      } catch (error) {
        // One bad index should not discard the others; an aborted caller still re-raises.
        if (isAborted(signal)) throw error;
      }
    }

    return collector.results;
  }

  /**
   * Query one CDX index for `*.domain` and feed the discovered URLs to the collector.
   *
   * Goes through `this.getTextLines` so the instance timeout applies; calling the bare client
   * helper would ignore `config.timeout` on the heavy path.
   *
   * @param cdxApi CDX endpoint of one index.
   * @param domain Target domain.
   * @param collector Shared per-call URL collector.
   * @param signal Caller cancellation, when provided.
   */
  private async queryIndex(
    cdxApi: string,
    domain: string,
    collector: UrlCollector,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const apiURL = new URL(cdxApi);
    apiURL.searchParams.set("url", `*.${domain}`);
    apiURL.searchParams.set("output", "text");
    apiURL.searchParams.set("fl", "url,timestamp");

    for await (const line of this.getTextLines(apiURL.toString(), { signal })) {
      if (collector.done) break;
      const parsed = parseCdxTextLine(line);
      if (!parsed) continue;
      for (const extracted of extractUrls(parsed.url)) {
        collector.push(this.name, extracted, apiURL.toString(), parsed.timestamp);
      }
    }
  }
}

/**
 * Check whether the collector is full or the caller aborted.
 *
 * @param collector Shared per-call URL collector.
 * @param signal Abort signal, when provided.
 * @returns {boolean} True when discovery should stop.
 */
function shouldStop(collector: UrlCollector, signal: AbortSignal | undefined): boolean {
  return collector.done || isAborted(signal);
}

/**
 * Check whether a caller asks to stop.
 *
 * @param signal Abort signal, when provided.
 * @returns {boolean} True when the signal is aborted.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
