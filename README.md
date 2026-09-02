# @agntn/urls

Passive URL discovery for AI agents and the CLI: one API over the public sources that already
index the web, with no active scanning.

URLFinder from ProjectDiscovery shows how useful this is in practice - point it at a domain and
it returns the URLs that Wayback, AlienVault OTX, Common Crawl, URLScan, and VirusTotal have seen
for it. `@agntn/urls` is the TypeScript version of that idea: five sources, one `discover()`
call, deduplicated and scoped to the domain you asked about.

## Install

Requires Node.js 24 or later.

```bash
pnpm add @agntn/urls
# or globally for the CLI
pnpm add -g @agntn/urls
```

## Quick start

```ts
import { create } from "@agntn/urls";

const wayback = create("wayback"); // keyless
const urls = await wayback.discover("example.com", { limit: 10 });

for (const hit of urls) {
  console.log(`${hit.source}: ${hit.url}`);
}
```

Every result is a `DiscoveredUrl`:

```ts
{
  url: "https://www.example.com/docs/index.html",
  source: "wayback",
  input: "example.com",
  reference: "https://web.archive.org/cdx/search/cdx?url=example.com/*&output=txt&fl=original",
}
```

## Sources

| Key           | Key required | Default endpoint                    |
| ------------- | ------------ | ----------------------------------- |
| `alienvault`  | no           | `https://otx.alienvault.com`        |
| `commoncrawl` | no           | `https://index.commoncrawl.org`     |
| `urlscan`     | optional     | `https://urlscan.io/api/v1/search/` |
| `virustotal`  | yes          | `https://www.virustotal.com/api/v3` |
| `wayback`     | no           | `https://web.archive.org`           |

Set credentials with environment variables:

```bash
export VIRUSTOTAL_API_KEY=...
export URLSCAN_API_KEY=... # optional; public searches answer without one
```

## CLI

```bash
# Default source (AlienVault OTX, keyless)
urls discover example.com

# One source, with a bound
urls discover example.com -p wayback -n 20

# Fan out to every source, compare side by side
urls discover example.com -p all

# Keep URLs containing "shop", drop ones containing "privacy"
urls discover example.com -m shop -f privacy

# JSONL for pipelines
urls discover example.com -p wayback -n 20 -j

# Disable the host-based scope (keeps URLs the sources report even off-domain)
urls discover example.com -p all --no-scope

# List sources and what each needs
urls providers
```

### Discovery options

- `limit` - stop collecting after this many URLs survive the filters. Sources stop paging or
  streaming the moment the bound is reached, so large CDX dumps are not downloaded in full.
- `match` / `filter` - comma-separated case-insensitive substrings. `match` keeps a URL when it
  contains any of the patterns; `filter` drops a URL when it contains any.
- `noScope` - disables the default host-based scope. Scoped discovery keeps only URLs whose host
  is the input domain or one of its subdomains; `www.example.com` belongs to `example.com`, while
  `example.com.evil.test` does not.

## Library API

```ts
import {
  create,
  providers,
  has,
  register,
  resolveProvider,
  selectProvider,
  isAllProviders,
  discoverAll,
  discoverWithFallback,
} from "@agntn/urls";
```

- `discoverWithFallback(domain, options)` - runs the auto-selected source, falling past sources
  whose failure is about access (missing key, billing, rate limit) to the next one that works.
- `discoverAll(domain, options)` - fans out to every registered source in parallel and returns
  per-source outcomes, errors included, for side-by-side comparison.
- `register(ProviderClass, defaultUrl)` - add your own passive source; it joins the fan-out and
  auto-selection like a built-in.
- `UrlCollector` - the shared scope/filter/dedupe engine every source pages through, exported so
  a custom collector can reuse the same rules.
- `extractUrls(text)`, `inScope(url, domain)`, `normalizeHost(input)` - the smaller primitives
  under the collector, useful for handling raw source dumps yourself.

## Agent surfaces

The extension tools reuse the same library call and the same env vars:

- Pi (`urls_discover`, `urls_providers`)
- OMP (`urls_discover`, `urls_providers`)
- MCP server on `urls mcp` with the same two tools
- AI SDK tools through `@agntn/urls/ai`

```bash
claude mcp add urls --scope user -- node "$PWD/dist/cli.mjs" mcp
```

## Notes

- **Common Crawl**'s index host (`index.commoncrawl.org`) has been unreachable from one
  development network (connection refused); the provider still works where the index is
  reachable and is exercised through mocked HTTP in unit tests.
- **Wayback** CDX answers are kept streaming, so `limit`-bounded calls cancel the download once
  the bound is hit; the `collapse=urlkey` variant of the query intermittently hangs on some
  networks, so exact-URL deduplication happens in the collector instead.
- **VirusTotal** uses the v3 API (`domains/{domain}/urls`); the legacy v2 endpoint answers 403
  HTML and is dead.

## Related

- [projectdiscovery/urlfinder](https://github.com/projectdiscovery/urlfinder) - the Go tool that
  inspired this library.
- Other `@agntn` provider libraries: `@agntn/web` (search/read), `@agntn/archives` (web archive
  snapshots), `@agntn/browsers` (browser services).
