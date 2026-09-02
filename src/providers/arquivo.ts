/**
 * Arquivo.pt provider - the Portuguese web archive CDX API
 *
 * No API key. One NDJSON query returns original URLs captured for the domain and its
 * subdomains. Snapshot bodies belong to `@agntn/archives`; this adapter only enumerates URLs.
 *
 * Verified 2026-09-02: `output=txt` is rejected; omit `limit` and the CDX stream hangs with
 * HTTP 200 and an empty body. Requests always send `output=json`, `fields=url`, and a limit.
 *
 * API: https://arquivo.pt/wayback/cdx (REST, NDJSON)
 */

import type {
  DiscoverOptions,
  DiscoveredUrl,
  ProviderCapabilities,
  ProviderConfig,
} from "../core/types.ts";
import { clampMaxResults } from "../core/types.ts";
import { Provider } from "../core/provider.ts";
import { buildQuery } from "../core/client.ts";
import { UrlCollector, extractUrls, resolveDomain } from "../core/url.ts";

/** Arquivo hangs without a limit; this is the per-request page safeguard. */
const CDX_PAGE_LIMIT = 10_000;

interface ArquivoRow {
  readonly url?: string;
}

/**
 * Read the `url` field from one NDJSON line. Malformed lines are skipped.
 *
 * @param line One CDX NDJSON record.
 * @returns {string | undefined} The URL field, when present.
 */
function parseArquivoUrl(line: string): string | undefined {
  try {
    const row: unknown = JSON.parse(line);
    if (typeof row !== "object" || row === null) return undefined;
    const url = (row as ArquivoRow).url;
    return typeof url === "string" ? url : undefined;
  } catch {
    return undefined;
  }
}

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
    const limit = clampMaxResults(options?.limit, CDX_PAGE_LIMIT);

    const apiURL = `${this.baseUrl}/wayback/cdx${buildQuery({
      url: target,
      matchType: "domain",
      output: "json",
      fields: "url",
      limit,
    })}`;

    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "application/x-ndjson, application/json, */*" },
    })) {
      if (collector.done) break;
      if (!line.trim()) continue;
      const record = parseArquivoUrl(line);
      if (!record) continue;
      for (const extracted of extractUrls(record)) {
        collector.push(this.name, extracted, apiURL);
      }
    }

    return collector.results;
  }
}
