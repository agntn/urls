/**
 * Arquivo.pt provider - the Portuguese web archive CDX API
 *
 * No API key. One NDJSON query returns original URLs captured for the domain and its
 * subdomains. Snapshot bodies belong to `@agntn/archives`; this adapter only enumerates URLs.
 *
 * Verified 2026-09-02: `output=txt` is rejected; omit `limit` and the CDX stream hangs with
 * HTTP 200 and an empty body. Requests always send `output=json`, `fields=url`, and a page-safeguard `limit`; the collector enforces the unique-result bound.
 *
 * Verified 2026-11-15: `matchType=prefix` folds case, scheme and `www.` like Wayback, so a
 * `urlScope` asks for its prefixes alone. `publico.pt/mundo/` stayed under that path, while the
 * whole domain was still streaming its first 82 KB after 150 s.
 *
 * API: https://arquivo.pt/wayback/cdx (REST, NDJSON)
 */

import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "../core/types.ts";
import { Provider } from "../core/provider.ts";
import { buildQuery } from "../core/client.ts";
import { cdxScopeQueries } from "../core/cdx-scope.ts";
import type { CdxScopeQuery } from "../core/cdx-scope.ts";
import { UrlCollector, extractUrls, resolveDomain } from "../core/url.ts";
import { parseCdxNdjsonLine } from "../core/url-shape.ts";

/**
 * Arquivo hangs without a limit; this is the per-request page safeguard. A response that fills
 * it may have been cut by the archive, so the collector is told the list is not complete.
 */
const CDX_PAGE_LIMIT = 10_000;

export class Arquivo extends Provider {
  static readonly key = "arquivo";

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://arquivo.pt";
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "arquivo");
    const collector = new UrlCollector(options, domain);

    let cut = false;
    for (const query of cdxScopeQueries(target, options?.urlScope)) {
      if (collector.done) break;
      const rows = await this.#collect(query, collector, options?.signal);
      cut ||= rows >= CDX_PAGE_LIMIT;
    }
    collector.truncated(this.name, cut);

    return collector.results;
  }

  /**
   * Stream one CDX query into the collector.
   *
   * @param query `url` and `matchType` of the request.
   * @param collector Shared per-call collector.
   * @param signal Caller abort signal.
   * @returns {Promise<number>} Rows the archive sent, to tell a full page from a complete one.
   */
  async #collect(
    query: CdxScopeQuery,
    collector: UrlCollector,
    signal: AbortSignal | undefined,
  ): Promise<number> {
    const apiURL = `${this.baseUrl}/wayback/cdx${buildQuery({
      ...query,
      output: "json",
      fields: "url,timestamp",
      limit: CDX_PAGE_LIMIT,
    })}`;

    let rows = 0;
    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "application/x-ndjson, application/json, */*" },
      signal,
    })) {
      if (collector.done) break;
      if (!line.trim()) continue;
      rows += 1;
      const parsed = parseCdxNdjsonLine(line);
      if (!parsed) continue;
      for (const extracted of extractUrls(parsed.url)) {
        collector.push(this.name, extracted, apiURL, parsed.timestamp);
      }
    }
    return rows;
  }
}
