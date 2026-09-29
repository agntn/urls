import { listProviders } from "../../../src/index.ts";

/** How a source is reached and what it hands back, for the pages that talk about it. */
interface ProviderNotes {
  readonly label: string;
  readonly icon: string;
  /** Endpoint path the provider asks, after the host. */
  readonly path: string;
  /** What one answer looks like on the wire. */
  readonly format: string;
  /** How the provider walks past the first answer, and where it stops on its own. */
  readonly paging: string;
  /** Environment variable the provider reads, and whether it has to be set. */
  readonly env?: { readonly name: string; readonly required: boolean };
  /** One sentence for the roster. */
  readonly about: string;
}

/** Presentation per registry key; the key list, endpoints and key requirement come from the library. */
const NOTES: Readonly<Record<string, ProviderNotes>> = {
  alienvault: {
    label: "AlienVault OTX",
    icon: "i-lucide-shield-alert",
    path: "/api/v1/indicators/domain/{domain}/url_list",
    format: "JSON pages",
    paging: "page by page, at most 20",
    about: "Threat intel URL lists. Keyless, but the public endpoint gets grumpy under load.",
  },
  arquivo: {
    label: "Arquivo.pt",
    icon: "i-lucide-landmark",
    path: "/wayback/cdx",
    format: "CDX NDJSON",
    paging: "one request, 10 000 rows",
    about: "The Portuguese web archive. CDX with dates, and a hard cap per request.",
  },
  commoncrawl: {
    label: "Common Crawl",
    icon: "i-lucide-database",
    path: "/collinfo.json + one CDX index per year",
    format: "CDX text",
    paging: "newest index of each of the last five years",
    about: "Crawl indexes, one per year for the last five. A broken index skips, the rest answer.",
  },
  urlscan: {
    label: "URLScan",
    icon: "i-lucide-scan-search",
    path: "/api/v1/search/",
    format: "JSON search pages",
    paging: "search_after cursor, at most 50 pages",
    env: { name: "URLSCAN_API_KEY", required: false },
    about: "Pages people scanned. Answers without a key at small volumes, more with one.",
  },
  vefsafn: {
    label: "Vefsafn",
    icon: "i-lucide-mountain-snow",
    path: "/cdx",
    format: "CDX NDJSON",
    paging: "one request, the whole domain dump",
    about: "The Icelandic web archive. Ignores limit and sends everything, the collector stops it.",
  },
  virustotal: {
    label: "VirusTotal",
    icon: "i-simple-icons-virustotal",
    path: "/domains/{domain}/urls",
    format: "JSON v3 pages",
    paging: "cursor, at most 50 pages",
    env: { name: "VIRUSTOTAL_API_KEY", required: true },
    about: "URLs VirusTotal has seen for the domain. No key, no answer.",
  },
  wayback: {
    label: "Wayback Machine",
    icon: "i-simple-icons-internetarchive",
    path: "/cdx/search/cdx",
    format: "CDX text",
    paging: "one streamed request",
    about: "The Internet Archive's CDX index. One streamed answer with dates, subdomains included.",
  },
};

/** One source as the site shows it. */
export interface ProviderInfo extends ProviderNotes {
  /** Registry key, the value of `provider` on every surface. */
  readonly key: string;
  readonly host: string;
  readonly defaultUrl: string;
  readonly requiresKey: boolean;
  /** Whether the source reports a capture date, which `from` and `to` need. */
  readonly dated: boolean;
  readonly to: string;
}

/** Sources that pass archive timestamps into the collector; the rest leave `firstSeen` empty. */
const DATED = new Set(["arquivo", "commoncrawl", "vefsafn", "wayback"]);

/** Every source the package registers, in registry order. */
export const PROVIDERS: readonly ProviderInfo[] = listProviders().map((listing) => {
  const notes = NOTES[listing.name];
  if (!notes) throw new Error(`No docs notes for provider "${listing.name}"`);
  const defaultUrl = listing.defaultUrl ?? "";
  return {
    ...notes,
    key: listing.name,
    host: defaultUrl ? new URL(defaultUrl).hostname : "",
    defaultUrl,
    requiresKey: listing.requiresKey ?? false,
    dated: DATED.has(listing.name),
    to: `/providers/${listing.name}`,
  };
});

/** Sources that answer with nothing configured. */
export const KEYLESS = PROVIDERS.filter((provider) => !provider.requiresKey);

const BY_KEY = new Map(PROVIDERS.map((provider) => [provider.key, provider]));

/**
 * Looks up one source by its registry key.
 *
 * @param {string} key - The registry key.
 * @returns {ProviderInfo | undefined} The source, or undefined for an unknown key.
 */
export function providerInfo(key: string): ProviderInfo | undefined {
  return BY_KEY.get(key);
}

/**
 * The name a person reads for a registry key.
 *
 * @param {string} key - The registry key.
 * @returns {string} The label, or the key itself when it is unknown.
 */
export function providerLabel(key: string): string {
  return providerInfo(key)?.label ?? key;
}
