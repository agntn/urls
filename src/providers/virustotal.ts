/**
 * VirusTotal provider - the v3 domain URL relationship API
 *
 * Auth: required API key. Env: VIRUSTOTAL_API_KEY. The key travels in the `x-apikey` header,
 * not the URL. Paginates through `links.next`.
 *
 * Verified 2026-09-02: the legacy `vtapi/v2/domain/report` endpoint answers 403 HTML (dead); the
 * v3 `domains/{domain}/urls` endpoint returns a JSON 401 for a bad key and is the live contract.
 *
 * API: https://www.virustotal.com/api/v3/domains/{domain}/urls (REST, JSON)
 */

import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "../core/types.ts";
import { Provider } from "../core/provider.ts";
import { UrlCollector, extractUrls, resolveDomain, sameOriginHttpUrl } from "../core/url.ts";
import { AuthError } from "../core/errors.ts";

/** Bounded pagination safeguard for a backend cursor that could run long. */
const MAX_PAGES = 50;

interface VtUrlItem {
  readonly attributes?: { readonly url?: string };
}

interface VtResponse {
  readonly data?: readonly VtUrlItem[];
  readonly links?: { readonly next?: string };
}

/**
 * Collect the URL records of one page and return the next cursor, if any.
 *
 * Extracted from `discover` so the method stays under the complexity budget while the
 * pagination loop reads as a straight line.
 *
 * @param data One v3 response page.
 * @param collector Shared per-call URL collector.
 * @param source Registry key reporting the URLs.
 * @param apiURL Query URL that returned the page.
 * @returns {string | undefined} The next cursor, or undefined when pagination is done.
 */
function collectPage(
  data: VtResponse | undefined,
  collector: UrlCollector,
  source: string,
  apiURL: string,
): string | undefined {
  for (const item of data?.data ?? []) {
    for (const extracted of extractUrls(item.attributes?.url ?? "")) {
      collector.push(source, extracted, apiURL);
    }
  }
  return data?.links?.next;
}

export class VirusTotal extends Provider {
  static readonly key = "virustotal";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? "https://www.virustotal.com/api/v3";
    const key = config.apiKey ?? process.env.VIRUSTOTAL_API_KEY ?? "";
    if (!key) {
      throw new AuthError("virustotal", "Set VIRUSTOTAL_API_KEY or pass apiKey in config");
    }
    this.apiKey = key;
    this.headers = { "x-apikey": this.apiKey };
  }

  get capabilities(): ProviderCapabilities {
    return { discover: true };
  }

  async discover(domain: string, options?: DiscoverOptions): Promise<DiscoveredUrl[]> {
    const target = resolveDomain(domain, "virustotal");
    const collector = new UrlCollector(options, domain);

    let next: string | undefined;
    for (let page = 0; page < MAX_PAGES && !collector.done; page++) {
      const apiURL = next ?? `${this.baseUrl}/domains/${target}/urls`;
      const data = await this.getJSON<VtResponse>(apiURL, { headers: this.headers });
      next = sameOriginHttpUrl(collectPage(data, collector, this.name, apiURL), this.baseUrl);
      if (!next) break;
    }

    return collector.results;
  }
}
