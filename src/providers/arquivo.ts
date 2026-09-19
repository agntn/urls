/**
 * Arquivo.pt provider - the Portuguese web archive CDX API
 *
 * No API key. One NDJSON query returns original URLs captured for the domain and its
 * subdomains. Snapshot bodies belong to `@agntn/archives`; this adapter only enumerates URLs.
 *
 * Verified 2026-09-02: `output=txt` is rejected; omit `limit` and the CDX stream hangs with
 * HTTP 200 and an empty body. Requests always send `output=json`, `fields=url`, and a page-safeguard `limit`; the collector enforces the unique-result bound.
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

    const apiURL = `${this.baseUrl}/wayback/cdx${buildQuery({
      url: target,
      matchType: "domain",
      output: "json",
      fields: "url,timestamp",
      limit: CDX_PAGE_LIMIT,
    })}`;

    let rows = 0;
    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "application/x-ndjson, application/json, */*" },
      signal: options?.signal,
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
    collector.truncated(this.name, rows >= CDX_PAGE_LIMIT);

    return collector.results;
  }
}
