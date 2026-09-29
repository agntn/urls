# Design system

The shared rules (direction, color roles, type, the `console-*` grammar, hero, docs chrome, density, motion, checks) live in the one agntn design system document, kept with the agntn skills until it ships in the shared package. This file records only what urls owns and where it departs from the shared rules. It doesn't repeat them.

The instruments urls owns:

| Instrument | Where | Object |
| --- | --- | --- |
| [LandingHero.vue](app/components/content/LandingHero.vue) | landing, first screen | hero zone, circuit `discoverAll()` into the discover instrument |
| [LandingDiscover.vue](app/components/content/LandingDiscover.vue) | under the hero | one comparison over every source: the domain as the subject, its URLs grouped by first path segment, the sources as cells |
| [ProviderCells.vue](app/components/ProviderCells.vue) | landing and `/discover` | every registered source as a cell, the node says answered, empty or failed |
| [LandingFilter.vue](app/components/content/LandingFilter.vue) | "Keep the URLs you came for" | the library's `UrlCollector` run in the browser over the walked sample, one chip per filter |
| [ProviderRoster.vue](app/components/content/ProviderRoster.vue) | landing and `/providers` | roster of the sources on `UTable`, sortable |
| [LandingToolCall.vue](app/components/content/LandingToolCall.vue) | "Two tools for your agent" | `urls_discover` for the walked domain and its recorded text |
| [LandingStart.vue](app/components/content/LandingStart.vue) | closing section | install, notes, first call as a file |
| [ProviderFacts.vue](app/components/content/ProviderFacts.vue) | every provider page | source dossier: ID bar with position and host, reticle, format, paging, dates, key, access leads |
| [ToolHero.vue](app/components/content/ToolHero.vue) | `/discover` | hero zone with the form on the circuit |
| [ExplorerPanel.vue](app/components/ExplorerPanel.vue) | `/discover` | the shell of one explorer instrument; `as="form"` for the form |
| [Landing.takumi.vue](app/components/OgImage/Landing.takumi.vue), [Docs.takumi.vue](app/components/OgImage/Docs.takumi.vue) | OG images | the hero zone in 1200 by 600; a docs page as one instrument with the two tools |

Source names, icons, formats and paging come from [providers.ts](app/utils/providers.ts); keys, endpoints and the key requirement from the library's registry. The landing samples come from [landing-samples.json](app/utils/landing-samples.json), recorded by `scripts/record-landing.ts` through the executor, and [useLandingDiscover.ts](app/composables/useLandingDiscover.ts) swaps in live answers.

## Nuxt UI variants

The same mapping as archives:

| Component and variant | Look | Used for |
| --- | --- | --- |
| `UButton` primary solid, neutral outline | action segment, glyph in its own cell | discover, get started, open the explorer |
| `UButton` neutral subtle | boxed control, `square` for a step | copy, previous and next |
| `UButton` variant `chip` | chip, primary for the picked one | the filters on the landing |
| `UInput`, `USelectMenu` none | the readout row is the frame | every explorer field |
| `UCheckbox` | square box, the accent once picked | `hasQuery` |

## Anatomy

- **Landing discover.** Bar `Call discoverAll("<domain>")` with the sample's position, meta `live` or `recorded`. Subject band: reticle with the link glyph, `Domain / provider=all`, the domain in mono, one sentence with the counts; under it `Paths [ by first segment ]`, five rows and a sixth for the rest, always drawn so every sample keeps one height. Readout: URLs in the accent, answered, the years seen, URLs in two or more sources. Band `Sources` with the cells. Footer: the link into `/discover` and previous and next.
- **Filters.** Bar with the call and its options, meta `in your browser`. One band: the chips, a readout of records, unique and kept, then the first five kept URLs, always five rows.
- **Explorer.** `ToolHero` zone, then the form (`Call urls_discover(...)`), then for `provider=all` a `Log` panel with the cells, then the `List` panel with a find field, the rows and the full tool text in a dialog. A failure is a line with a red `Failed` tag inside its own shell.

## Motion

| Change | Motion |
| --- | --- |
| landing sample advances (4.2 s, paused on hover and focus) | ruler cursor once, scan and reticle arcs, path bars grow from the left |
| a call in flight | ruler cursor loops (`console-cursor-busy`) on the form |
| reduced motion | no walk; previous and next still work |

## Differences

Departures from the shared rules, recorded for the shared package:

- The landing's hero instrument hides below 48rem like the shared rule says; `/discover` keeps its form (`hero-instrument-keep`).
- The explorer has one page, so the zone carries no page navigation.
- No data version exists, so ID strips and footers carry none. The version comes from the root `package.json`.
- The OG images ship local Figtree and Fira Code TTFs, the keys mechanism, like archives and web.

## Checks

Beyond the shared checks: the landing at 1440, 1024, 390 and 320 px through every sample; `/discover` with a deep link for one source and for `all`; `/providers` and one provider page at 390 px.
