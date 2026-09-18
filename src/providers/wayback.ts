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
import { parseCdxTextLine } from "../core/url-shape.ts";

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
      url: target,
      matchType: "domain",
      output: "txt",
      fl: "original,timestamp",
    })}`;

    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "text/plain, */*" },
      signal: options?.signal,
    })) {
      if (collector.done) break;
      const parsed = parseCdxTextLine(line);
      if (!parsed) continue;
      for (const extracted of extractUrls(parsed.url)) {
        collector.push(this.name, extracted, apiURL, parsed.timestamp);
      }
    }

    return collector.results;
  }
}
