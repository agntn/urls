# docs/

Docus site for `@agntn/urls` at urls.agntn.dev. Markdown lives in `content/`. The explorer is a Vue page backed by one Nitro route.

## Layout

```
docs/
├── nuxt.config.ts                 # extends: ['docus'], cloudflare_module preset, library alias, local fonts, Shiki theme
├── shiki-theme.ts                 # code block theme, every colour a `--shiki-token-*` variable from app.css
├── DESIGN.md                      # what this site owns on top of the agntn design system
├── app/app.config.ts              # title, github, Nuxt UI variants in the instrument grammar
├── app/app.css                    # tokens, the shared `console-*` grammar, docs chrome, variant classes, `urls-*` parts
├── app/components/                # Docus overrides (header, sidebar, toc, page links, surround), ExplorerPanel, ProviderCells, OG templates
├── app/components/content/        # MDC components (`::landing-home`, `::provider-facts`, `::provider-roster`), Prose* overrides, landing instruments
├── app/composables/               # useLandingDiscover (one clock for every landing panel), useSubNavigation, useCopied, useRosterFlip
├── app/utils/                     # providers table, sample helpers, recorded landing samples, formatting, tokens, roster classes
├── app/pages/discover.vue         # the explorer
├── server/api/                    # discover, providers over the library
├── scripts/record-landing.ts      # records app/utils/landing-samples.json through the executor
├── content/index.md               # landing
├── content/1.guide/               # getting started, discover, filters, CLI, agents, custom providers
└── content/2.providers/           # one page per source
```

## Commands

```bash
pnpm install                          # from docs/
pnpm dev                              # http://localhost:3000
pnpm build                            # Cloudflare Workers output in .output/, content routes prerendered
pnpm deploy                           # build, then wrangler deploy to urls.agntn.dev
node scripts/record-landing.ts        # refresh the landing samples (live network)
```

Deployment: Nitro preset `cloudflare_module`. Nuxt Content needs a D1 binding named `DB` and the response cache a KV binding named `CACHE`. `wrangler.jsonc` binds both to `agntn-urls`: the D1 database lives in the EU jurisdiction, which the binding doesn't repeat because the id already names it.

The site bundles `@agntn/urls` from `../src` through the alias in `nuxt.config.ts`, so it needs neither `dist/` nor the root `node_modules`. The part of `src/` the site imports has no npm dependency today. A new package import under `src/core` or `src/providers` needs the same entry in `docs/package.json`, or the Workers build fails while a local build still passes.

## Live data

- `server/api/discover.get.ts` calls `runDiscoverPage`, the executor behind `urls_discover`. With `provider=all` it runs one call per source, each with its own 35 s deadline, and assembles the `serializeOutcomes` shape itself: one slow source would otherwise sink the whole comparison.
- Every route goes through `cachedAnswer` in `server/utils/query.ts`: exact parameters as the key, six hours for a clean answer, five minutes for one with a failed source. A cache miss counts against the `DISCOVER_LIMIT` rate limiting binding (20 a minute per `CF-Connecting-IP`, the number repeated as `RATE_LIMIT`); hits are free. Don't bypass it, the sources are public services. Without the binding, as in `nuxt dev`, a counter per isolate stands in.
- Parameters are capped in `server/utils/query.ts` (`limit` 100, 16 items per list). Raise them there.
- No API key is configured on the worker. VirusTotal answers with the library's `AuthError`, URLScan runs at its public quota.
- A client that disconnects aborts its sources and ends as a 499, which the error log skips.
- `app/utils/landing-samples.json` is written by `scripts/record-landing.ts`, never by hand. It stores records without `ext` and `queryKeys`; `restoreRecord` in `app/utils/discover.ts` rebuilds them in the collector's key order, and `test/unit/docs-samples.test.ts` in the root pins that.
- The explorer applies its deep link through a `watch(route.query)` that fires once: a prerendered page hydrates with an empty query and Nuxt restores the address after mount.

## Constraints

- Source names, icons, formats and the roster sentence live once in `app/utils/providers.ts`, keyed by registry key. The key list, endpoints and key requirement come from `listProviders()`, and a key without notes throws at import.
- Counts in copy come from the library (`PROVIDERS.length`, `KEYLESS.length`, `DEFAULT_DISCOVER_LIMIT`). Markdown and frontmatter don't carry counts that change with the registry.
- Discovered URLs are data. Render them as text through interpolation, never `v-html`, never as links a click would follow.
- The look follows the agntn design system; `DESIGN.md` lists what this site owns. Actions, chips and fields are Nuxt UI components with their variant in `app.config.ts`, never a hand-built `<button>`.
