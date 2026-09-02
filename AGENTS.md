# AGENTS.md

Keep AGENTS.md updated with project status.

## Status

- Scaffolded as an `@agntn` provider library inspired by `projectdiscovery/urlfinder`: unified
  passive URL discovery over five sources (alienvault, commoncrawl, urlscan, virustotal, wayback)
  with CLI, Pi/OMP extensions, MCP server, and AI SDK tools.
- Full gate green: lint (shared `@agntn/ox` + repo-local allow-list extension), typecheck
  (tsc + extensions), 89 unit tests, and the three eval gates (CLI, MCP, packed) in offline and
  live mode.
- Global CLI (`urls`) installed and smoke-tested.

## Stack

- **Runtime**: Node.js 26 dev baseline, >= 24 supported
- **Language**: TypeScript (strict, `erasableSyntaxOnly`)
- **Build**: obuild (one bundle, shared provider registry across index/cli/mcp/ai)
- **Test**: vitest + `test/eval-*.mjs` subprocess gates
- **Lint**: oxlint + oxfmt through `@agntn/ox`, `prefer-readonly-parameter-types` allow list
  extended repo-locally (see `oxlint.config.ts`)
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
src/providers/             - one self-registering file per passive source
src/commands/              - discover, providers, mcp
src/ai.ts, src/mcp.ts      - AI SDK and MCP surfaces over the same executors
packages/pi/extensions/    - Pi extension source shipped with the package
packages/omp/extensions/   - OMP extension source shipped with the package
test/unit/                 - vitest unit tests
test/eval-cli.mjs etc.     - packaged/CLI/MCP subprocess gates
```

## Conventions

- ESM only; published files are `.mjs` / `.d.mts`.
- Sources self-register via `register(Class, defaultUrl)`; `src/index.ts`, `cli.ts`, `mcp.ts`,
  and `ai.ts` all import `./providers/index.ts` so one bundle keeps one registry.
- All interface fields are `readonly`; function params keep named library types (the repo-local
  allow list covers the internal ones).
- Streams: CDX-style dumps go through `getTextLines` (plain fetch, status classified before body
  read, early break cancels the reader). `ofetch` cannot stream without consuming.

## API audit (2026-09-02)

| Source      | Verdict      | Notes                                                                                                                    |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| alienvault  | live         | `otx.alienvault.com/api/v1/indicators/domain/{d}/url_list`, paginated                                                    |
| wayback     | live         | `web.archive.org/cdx/search/cdx` text lines; `collapse=urlkey` variant hangs from this network, dedupe done in collector |
| urlscan     | live         | answers without key at small volumes; cursor pagination via `search_after`                                               |
| virustotal  | live (v3)    | legacy `vtapi/v2` answers 403 HTML (dead); v3 `domains/{d}/urls` with `x-apikey`                                         |
| commoncrawl | blocked here | `index.commoncrawl.org` refused from this network; keep, tests mock HTTP                                                 |

## Status

- Pull requests and issues use short, freeform descriptions focused on why a change is needed.
