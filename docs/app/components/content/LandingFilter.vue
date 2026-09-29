<script setup lang="ts">
import { UrlCollector, urlExtension, type DiscoverOptions } from "@agntn/urls";
import { mergeUrls, pathBranches, sampleRecords, type DiscoverSample } from "../../utils/discover";

/**
 * The library's own collector, run in the browser over the walked sample: pick a filter and the
 * counts and the first URLs are what `discover()` would keep from the same records.
 */
const props = defineProps<{ target: string; sample: DiscoverSample | undefined }>();

/** Rows of kept URLs; always drawn, so the panel keeps one height. */
const ROWS = 3;

const records = computed(() => sampleRecords(props.sample));

/** Filters built from what the sample actually holds, so every chip keeps something to look at. */
const presets = computed(() => {
  const urls = mergeUrls(props.sample);
  const branch = pathBranches(urls, 8).find((entry) => !entry.path.endsWith("/") && !entry.path.endsWith("more"))?.path;
  const extensions = new Map<string, number>();
  for (const { url } of urls) {
    const ext = urlExtension(url);
    if (ext) extensions.set(ext, (extensions.get(ext) ?? 0) + 1);
  }
  const ext = [...extensions].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "js";
  const scope = `*${branch ?? `${props.target}/`}*`;
  return [
    { label: "host", code: "{}", options: {} },
    { label: "urlScope", code: `{ urlScope: ["${scope}"] }`, options: { urlScope: [scope] } },
    { label: "ext", code: `{ ext: ["${ext}"] }`, options: { ext: [ext] } },
    { label: "hasQuery", code: "{ hasQuery: true }", options: { hasQuery: true } },
  ] satisfies { label: string; code: string; options: DiscoverOptions }[];
});

const picked = ref(0);
const preset = computed(() => presets.value[picked.value] ?? presets.value[0]!);

const kept = computed(() => {
  const collector = new UrlCollector(preset.value.options, props.target);
  for (const record of records.value) collector.push(record.source, record.url, undefined, record.firstSeen);
  return collector.results;
});
const unique = computed(() => {
  const collector = new UrlCollector({ noScope: true }, props.target);
  for (const record of records.value) collector.push(record.source, record.url);
  return collector.count;
});
const rows = computed(() => Array.from({ length: ROWS }, (_, index) => kept.value[index]));
</script>

<template>
  <section class="tool-console landing-filter" aria-label="Filters on one sample">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`discover(&quot;${target}&quot;, ${preset.code})`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>discover(<span class="tok-str">"{{ target }}"</span>, {{ preset.code }})</span
        >
      </UTooltip>
      <span class="console-meta">in your browser</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="`${target}-${picked}`" class="console-cursor" />
    </div>

    <div class="console-band filter-band">
      <div class="filter-chips" role="group" aria-label="Filter">
        <UButton
          v-for="(entry, position) in presets"
          :key="entry.label"
          :color="position === picked ? 'primary' : 'neutral'"
          variant="chip"
          :label="entry.label"
          :aria-pressed="position === picked"
          @click="picked = position"
        />
      </div>

      <dl class="console-readout-rows filter-readout">
        <div>
          <dt>Unique</dt>
          <dd>{{ unique }} of {{ records.length }} records</dd>
        </div>
        <div>
          <dt>Kept</dt>
          <dd class="console-accent">{{ kept.length }}</dd>
        </div>
      </dl>

      <p class="console-label console-rule-title">
        <span>Kept <span aria-hidden="true">[ first {{ ROWS }} ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ol :key="`${target}-${picked}`" class="filter-rows console-animate">
        <li v-for="(row, position) in rows" :key="position" :data-empty="!row">
          <template v-if="row">
            <span class="filter-source">{{ row.source }}</span>
            <UTooltip :text="row.url">
              <span class="filter-url" tabindex="0">{{ row.url }}</span>
            </UTooltip>
          </template>
          <span v-else-if="position === 0" class="filter-none">nothing survives this filter</span>
        </li>
      </ol>
    </div>

    <footer class="console-footer console-footer-plain">
      <span>Same <code>UrlCollector</code> the providers use</span>
      <span class="console-meta">no request sent</span>
    </footer>
  </section>
</template>

<style scoped>
.filter-band {
  display: grid;
  gap: 14px;
}
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-readout > div {
  grid-template-columns: 6rem minmax(0, 1fr);
}
.filter-rows {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.filter-rows > li {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  gap: 10px;
  height: 22px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 22px;
}
.filter-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
.filter-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.filter-none {
  grid-column: 1 / -1;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--ui-text-muted);
}
.landing-filter code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-highlighted);
}
@media (width < 400px) {
  .filter-rows > li {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
}
</style>
