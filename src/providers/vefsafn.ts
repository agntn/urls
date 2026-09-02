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

interface VefsafnRow {
  readonly url?: string;
}

/**
 * Read the `url` field from one NDJSON line. Malformed lines are skipped.
 *
 * @param line One CDX NDJSON record.
 * @returns {string | undefined} The URL field, when present.
 */
function parseVefsafnUrl(line: string): string | undefined {
  try {
    const row: unknown = JSON.parse(line);
    if (typeof row !== "object" || row === null) return undefined;
    const url = (row as VefsafnRow).url;
    return typeof url === "string" ? url : undefined;
  } catch {
    return undefined;
  }
}

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
      fields: "url",
    })}`;

    for await (const line of this.getTextLines(apiURL, {
      headers: { Accept: "application/x-ndjson, application/json, */*" },
    })) {
      if (collector.done) break;
      if (!line.trim()) continue;
      const record = parseVefsafnUrl(line);
      if (!record) continue;
      for (const extracted of extractUrls(record)) {
        collector.push(this.name, extracted, apiURL);
      }
    }

    return collector.results;
  }
}
