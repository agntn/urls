/** Built-in providers: registry metadata plus a loader for the implementation */

import type { ProviderEntry } from "../core/types.ts";

/**
 * Every provider shipped with the package, in registration order.
 *
 * A provider missing here is invisible to `create()`. The lazy manifest keeps only static
 * metadata and a loader; the concrete module is imported on the first `create()` for that key.
 * `test/unit/registry.test.ts` loads every entry and compares it against the class, so metadata
 * cannot drift away from the implementation.
 */
export const builtins: readonly ProviderEntry[] = [
  {
    key: "alienvault",
    capabilities: { discover: true },
    defaultURL: "https://otx.alienvault.com",
    load: () => import("./alienvault.ts").then((m) => m.AlienVault),
  },
  {
    key: "arquivo",
    capabilities: { discover: true },
    defaultURL: "https://arquivo.pt",
    load: () => import("./arquivo.ts").then((m) => m.Arquivo),
  },
  {
    key: "commoncrawl",
    capabilities: { discover: true },
    defaultURL: "https://index.commoncrawl.org",
    load: () => import("./commoncrawl.ts").then((m) => m.CommonCrawl),
  },
  {
    key: "urlscan",
    capabilities: { discover: true },
    defaultURL: "https://urlscan.io/api/v1/search/",
    load: () => import("./urlscan.ts").then((m) => m.UrlScan),
  },
  {
    key: "vefsafn",
    capabilities: { discover: true },
    defaultURL: "https://vefsafn.is",
    load: () => import("./vefsafn.ts").then((m) => m.Vefsafn),
  },
  {
    key: "virustotal",
    capabilities: { discover: true },
    defaultURL: "https://www.virustotal.com/api/v3",
    requiresKey: true,
    load: () => import("./virustotal.ts").then((m) => m.VirusTotal),
  },
  {
    key: "wayback",
    capabilities: { discover: true },
    defaultURL: "https://web.archive.org",
    load: () => import("./wayback.ts").then((m) => m.Wayback),
  },
];
