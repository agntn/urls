/**
 * AlienVault OTX provider - the public domain URL list API
 *
 * No API key. Paginates `url_list` until `has_next` flips false. The public endpoint rate-limits
 * anonymous traffic, so expect `RateLimitError` under parallel use.
 *
 * API: https://otx.alienvault.com/api/v1/indicators/domain/{domain}/url_list (REST, JSON)
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

/** Bounded pagination safeguard for a backend that can say `has_next` forever. */
const MAX_PAGES = 20;

interface AlienVaultPage {
  readonly url_list?: readonly { readonly url?: string }[];
  readonly has_next?: boolean;
}

export class AlienVault extends Provider {
  static readonly key = "alienvault";

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://otx.alienvault.com";
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "alienvault");
    const collector = new UrlCollector(options, domain);

    for (let page = 1; page <= MAX_PAGES && !collector.done; page++) {
      const apiURL = `${this.baseUrl}/api/v1/indicators/domain/${target}/url_list${buildQuery({ page })}`;
      const data = await this.getJSON<AlienVaultPage>(apiURL, { signal: options?.signal });
      for (const record of data.url_list ?? []) {
        for (const extracted of extractUrls(record.url ?? "")) {
          collector.push(this.name, extracted, apiURL);
        }
      }
      if (!data.has_next) break;
    }

    return collector.results;
  }
}
