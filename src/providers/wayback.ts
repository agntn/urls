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
import { UrlCollector, extractUrls, resolveDomain } from "../core/url.ts";

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

    const apiURL = `${this.baseUrl}/cdx/search/cdx${buildQuery({
      url: `${target}/*`,
      output: "txt",
      fl: "original",
    })}`;

    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "text/plain, */*" },
    })) {
      if (collector.done) break;
      if (!line.trim()) continue;
      for (const extracted of extractUrls(line)) {
        collector.push(this.name, extracted, apiURL);
      }
    }

    return collector.results;
  }
}
