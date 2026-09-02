/**
 * URLScan provider - the search API
 *
 * Optional API key (env `URLSCAN_API_KEY`). Public searches answer without a key at lower rate
 * limits; when a key is present it travels in the `API-Key` header. Paginates through the
 * `search_after` cursor while `has_more` stays true.
 *
 * API: https://urlscan.io/api/v1/search/ (REST, JSON)
 */

import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "../core/types.ts";
import { Provider } from "../core/provider.ts";
import { UrlCollector, extractUrls, resolveDomain } from "../core/url.ts";
import { UrlsError } from "../core/errors.ts";
import { register } from "../core/registry.ts";

/** Bounded pagination safeguard for a backend that can say `has_more` forever. */
const MAX_PAGES = 50;

interface UrlScanResult {
  readonly page?: { readonly url?: string };
  /** Elasticsearch-style cursor: [number, string] */
  readonly sort?: readonly unknown[];
}

interface UrlScanPage {
  readonly results?: readonly UrlScanResult[];
  readonly has_more?: boolean;
}

/**
 * Collect the URL records of one search page and return the next cursor, if any.
 *
 * Extracted from `discover` so the method stays under the complexity budget while the
 * pagination loop reads as a straight line.
 *
 * @param data One search API page.
 * @param collector Shared per-call URL collector.
 * @param source Registry key reporting the URLs.
 * @param apiURL Query URL that returned the page.
 * @returns {string | undefined} The next `search_after` cursor, or undefined when pagination is done.
 */
function collectSearchPage(
  data: UrlScanPage | undefined,
  collector: UrlCollector,
  source: string,
  apiURL: string,
): string | undefined {
  pushPageUrls(data?.results, collector, source, apiURL);
  if (!data?.has_more) return undefined;
  // Defensive: `has_more` without a row to advance the cursor would loop forever.
  const results = data.results ?? [];
  if (results.length === 0) return undefined;
  return buildSearchAfter(results.at(-1)?.sort);
}

/**
 * Push every URL of one page into the collector.
 *
 * @param results Page results.
 * @param collector Shared per-call URL collector.
 * @param source Registry key reporting the URLs.
 * @param apiURL Query URL that returned the page.
 */
function pushPageUrls(
  results: readonly UrlScanResult[] | undefined,
  collector: UrlCollector,
  source: string,
  apiURL: string,
): void {
  for (const result of results ?? []) {
    for (const extracted of extractUrls(result.page?.url ?? "")) {
      collector.push(source, extracted, apiURL);
    }
  }
}

/**
 * URLScan's `sort` array is a finite integer followed by a non-empty string; the cursor is their
 * comma join. Anything else would loop the pagination or produce a malformed query.
 *
 * @param sort Elasticsearch sort cursor from the last result of a page.
 * @returns {string} The comma-joined `search_after` cursor.
 */
function buildSearchAfter(sort: readonly unknown[] | undefined): string {
  if (!sort || sort.length < 2) {
    throw new UrlsError("invalid urlscan sort: expected at least 2 values", "urlscan");
  }
  const first = sort[0];
  const second = sort[1];
  if (typeof first !== "number" || !Number.isFinite(first) || first !== Math.trunc(first)) {
    throw new UrlsError("invalid urlscan sort: first value must be a finite integer", "urlscan");
  }
  if (typeof second !== "string" || second === "") {
    throw new UrlsError("invalid urlscan sort: second value must be a non-empty string", "urlscan");
  }
  return `${first},${second}`;
}

class UrlScan extends Provider {
  static readonly key = "urlscan";

  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://urlscan.io/api/v1/search/";
    this.apiKey = config.apiKey ?? (process.env.URLSCAN_API_KEY || undefined);
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "urlscan");
    const collector = new UrlCollector(options, domain);
    const headers: Record<string, string> | undefined = this.apiKey
      ? { "API-Key": this.apiKey }
      : undefined;

    let searchAfter: string | undefined;
    for (let page = 0; page < MAX_PAGES && !collector.done; page++) {
      const apiURL = new URL(this.baseUrl);
      apiURL.searchParams.set("q", `domain:${target}`);
      apiURL.searchParams.set("size", "10000");
      if (searchAfter) apiURL.searchParams.set("search_after", searchAfter);

      const data = await this.getJSON<UrlScanPage>(apiURL.toString(), { headers });
      searchAfter = collectSearchPage(data, collector, this.name, apiURL.toString());
      if (!searchAfter) break;
    }

    return collector.results;
  }
}

register(UrlScan, "https://urlscan.io/api/v1/search/");
