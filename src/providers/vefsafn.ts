/**
 * Vefsafn provider - the Icelandic web archive CDX API
 *
 * No API key. One NDJSON query returns original URLs captured for the domain and its
 * subdomains. Snapshot bodies belong to `@agntn/archives`; this adapter only enumerates URLs.
 *
 * Verified 2026-09-02: `output=txt` is rejected; `limit` is ignored and the full domain dump
 * streams; `fields=url` keeps each line to the URL. Early `break` cancels the reader.
 *
 * API: https://vefsafn.is/cdx (REST, NDJSON)
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

export class Vefsafn extends Provider {
  static readonly key = "vefsafn";

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://vefsafn.is";
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "vefsafn");
    const collector = new UrlCollector(options, domain);

    const apiURL = `${this.baseUrl}/cdx${buildQuery({
      url: target,
      matchType: "domain",
      output: "json",
      fields: "url,timestamp",
    })}`;

    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "application/x-ndjson, application/json, */*" },
      signal: options?.signal,
    })) {
      if (collector.done) break;
      if (!line.trim()) continue;
      const parsed = parseCdxNdjsonLine(line);
      if (!parsed) continue;
      for (const extracted of extractUrls(parsed.url)) {
        collector.push(this.name, extracted, apiURL, parsed.timestamp);
      }
    }

    return collector.results;
  }
}
