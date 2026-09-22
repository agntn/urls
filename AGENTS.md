# AGENTS.md

Keep AGENTS.md updated with project status.

## Status

- Scaffolded as an `@agntn` provider library inspired by `projectdiscovery/urlfinder`: unified
  passive URL discovery over seven sources (alienvault, arquivo, commoncrawl, urlscan, vefsafn, virustotal, wayback)
  with CLI, Pi/OMP extensions, MCP server, and AI SDK tools.
- Full gate green: lint (shared `@agntn/ox` spread; readonly allow-list is host ABI and three classes), typecheck
  (tsc + extensions), unit tests, and the three eval gates (CLI, MCP, packed) in offline and
  live mode.
- Global CLI (`urls`) installed and smoke-tested.
- CLI help loads command metadata without the MCP SDK; the `mcp` command imports its server
  and transport inside `run()`. `test/eval-cli.mjs` guards this boundary on the built CLI.
- Agent surfaces (MCP, AI SDK, Pi, OMP) answer with bounded pages: `DEFAULT_DISCOVER_LIMIT`
  (100) unless `limit` says otherwise, `hasMore` and `truncated` on every page, `reference`
  opt-in on the JSON surfaces. Library and CLI stay unbounded.
- No HTTP client dependency: `getJSON` moved to plain `fetch`, so importing the library (the Pi and
  OMP first call) dropped from 41 to 6 ms and MCP start to `tools/list` from 193 to 161 ms.

## Stack

- **Runtime**: Node.js 26 dev baseline, >= 24 supported
- **Language**: TypeScript (strict, `erasableSyntaxOnly`)
- **Build**: obuild (one bundle; every provider file is a separate lazy input, `dist/providers/*.mjs`)
- **Registry**: lazy manifest (`builtins` in `src/providers/index.ts`); `create()` is async,
  single-flight, retries a rejected load; `sideEffects: false`; subpath `./providers/*`
- **Test**: vitest + `test/eval-*.mjs` subprocess gates
- **Lint**: oxlint + oxfmt through `@agntn/ox` (spread, not extends). Readonly allow-list is host
  ABI, lib types with mutating methods, and the three classes the rule cannot see as unused
  mutably (`Provider`, `UrlCollector`, `UrlsError`). Eval `*.mjs` override only `no-unsafe-*`.
- **Package manager**: pnpm 11

## Scripts

- `pnpm build` - production build
- `pnpm dev` - stub build for development
- `pnpm test` - run unit tests once
- `pnpm test:cli` / `pnpm test:mcp` / `pnpm test:packed` - eval gates (live network unless
  `URLS_EVAL_OFFLINE=1`)
- `pnpm lint` - build + oxlint + oxfmt check
- `pnpm fmt` - build + auto-fix lint + format
- `pnpm typecheck` - base tsc + extensions tsc
- `pnpm release` - test, build, changelogen release

## Structure

```
src/core/                  - types, errors, client, registry, resolve, all, url helpers
src/providers/             - one file per passive source; lazy-loaded from the builtins manifest
src/tool-operations.ts     - shared discovery executors: runDiscover (explicit / all / fallback)
                             and the bounded runDiscoverPage the agent surfaces use
src/commands/              - discover, providers, mcp
src/ai.ts, src/mcp.ts      - AI SDK and MCP surfaces over the same executors
packages/pi/extensions/    - Pi extension source shipped with the package
packages/omp/extensions/   - OMP extension source shipped with the package
test/unit/                 - vitest unit tests
test/eval-cli.mjs etc.     - packaged/CLI/MCP subprocess gates
```

## Conventions

- ESM only; published files are `.mjs` / `.d.mts`.
- Lazy manifest: `src/providers/index.ts` exports only metadata + loaders; modules load on the
  first `create()` for a key. `register(Class, meta)` is for elements outside the package. New
  providers need their file, `export`ed class, and a manifest entry - the build input list is
  derived from the directory, not written by hand.
- All interface fields are `readonly`; function params keep named library types (the repo-local
  allow list covers the internal ones).
- HTTP: plain `fetch` on both paths, no client library; one would load on every Pi/OMP first
  call and MCP start. CDX-style dumps go through `getTextLines` (status classified before body
  read, early break cancels the reader, 60s default timeout); JSON through `getJSON` (body parsed
  whatever the content type, a non-2xx keeps its text as `HTTPError.body`, 30s default timeout).
- Cancellation: every provider request takes `options.signal`, composed with the timeout in the
  client; a caller abort surfaces as the caller's reason. MCP (`extra.signal`), AI SDK
  (`abortSignal`), Pi and OMP (`execute` third argument) hand over the host's signal.
- Domain input: every source _request_ is built from `resolveDomain()`, the derived hostname of a
  bare domain or full URL; unparseable input, path-traversing hosts (`.`, `..`, empty labels),
  single-label public suffixes (except `localhost`), and schemeless userinfo are rejected before
  I/O. That hostname is the query target, not program scope.
- Result scope is URL-shaped: default `inScope` is only a host safety net on the URL's host.
  `urlScope` / `urlOutScope` match the full URL (prefix with `/` `?` `#` boundary, or `*` glob).
  Do not treat scope as DNS records or as a domain list. Dedup keys go through `normalizeUrl`.
  CDX sources pass archive timestamps into the collector as `firstSeen` / `lastSeen`.
- Limit: `MAX_DISCOVER_RESULTS` (100000) is the published bound. `UrlCollector` clamps provided
  limits; CLI rejects out of range; MCP/AI schemas use the same constant. Absent limit stays
  unbounded aside from per-source page safeguards on the library and CLI only: the agent
  surfaces (MCP, AI SDK, Pi, OMP) go through `runDiscoverPage`, which defaults to
  `DEFAULT_DISCOVER_LIMIT` (100, next to the bound in `core/types.ts`) and fetches one URL past
  the bound to report `hasMore`; a full page at the published bound reports `hasMore` too, since
  the probe cannot look further, and so does a source that stopped on its own with more still
  there (page safeguard: AlienVault 20 pages, urlscan and VirusTotal 50; a cursor VirusTotal
  refuses to follow; an Arquivo response that fills its 10000-row request cap), which it reports
  through `DiscoverOptions.onTruncated` and the page carries as `truncated`. Filters cannot
  reach those rows, because they apply to what the source returned. `reference` stays off the records unless the JSON surfaces (MCP,
  AI SDK) ask for it; Pi and OMP print URLs only and take no such switch.

## API audit (2026-09-02)

| Source      | Verdict      | Notes                                                                                                                           |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| alienvault  | live         | `otx.alienvault.com/api/v1/indicators/domain/{d}/url_list`, paginated                                                           |
| arquivo     | live         | `arquivo.pt/wayback/cdx` NDJSON `matchType=domain`; `output=txt` rejected; omit `limit` hangs; snapshot bodies stay in archives |
| wayback     | live         | `web.archive.org/cdx/search/cdx` text `matchType=domain`; `collapse=urlkey` hangs from this network, dedupe in collector        |
| urlscan     | live         | answers without key at small volumes; cursor pagination via `search_after`                                                      |
| vefsafn     | live         | `vefsafn.is/cdx` NDJSON `matchType=domain`; `output=txt` rejected; `limit` ignored; snapshot bodies stay in archives            |
| virustotal  | live (v3)    | legacy `vtapi/v2` answers 403 HTML (dead); v3 `domains/{d}/urls` with `x-apikey`                                                |
| commoncrawl | blocked here | `index.commoncrawl.org` refused here; tests mock HTTP; CDX URLs stay on configured origin                                       |

## Status

- Pull requests and issues use short, freeform descriptions focused on why a change is needed.
