<script setup lang="ts">
import { dateOnly } from "../../utils/format";
import { mergeUrls, pathBranches, seenSpan, sourceCells, type DiscoverSample } from "../../utils/discover";
import { PROVIDERS } from "../../utils/providers";

/**
 * One `discover(target)` over every source, the way the sources remember a site: the merged URLs
 * grouped by their first path segment, and every source as a cell under it.
 */
const props = defineProps<{
  target: string;
  sample: DiscoverSample | undefined;
  position: number;
  total: number;
}>();

const emit = defineEmits<{
  step: [delta: number];
  pause: [value: boolean];
}>();

/** Rows in the path band; always drawn, so the instrument keeps one height for every sample. */
const BRANCHES = 5;

const urls = computed(() => mergeUrls(props.sample));
const cells = computed(() => sourceCells(props.sample));
const answered = computed(() => cells.value.filter((cell) => cell.state === "ok").length);
const shared = computed(() => urls.value.filter((url) => url.sources.length > 1).length);
const branches = computed(() => {
  const rows = pathBranches(urls.value, BRANCHES);
  return Array.from({ length: BRANCHES + 1 }, (_, index) => rows[index]);
});
const peak = computed(() => Math.max(1, ...branches.value.map((branch) => branch?.count ?? 0)));

const call = computed(() => `discoverAll("${props.target}", { limit: ${props.sample?.limit ?? 0} })`);
</script>

<template>
  <section
    class="tool-console console-wide landing-discover"
    aria-label="One domain across every source"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
    @focusin="emit('pause', true)"
    @focusout="emit('pause', false)"
  >
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="call">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>discoverAll(<span class="tok-str">"{{ target }}"</span>)<span
            class="console-file"
            >{{ String(position + 1).padStart(2, "0") }} / {{ String(total).padStart(2, "0") }}</span
          ></span
        >
      </UTooltip>
      <span class="console-meta">{{ sample?.live ? "live" : `recorded ${dateOnly(sample?.fetchedAt ?? "")}` }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="target" class="console-cursor" />
    </div>

    <div class="console-band console-subject-band">
      <div :key="target" class="console-scan" aria-hidden="true" />
      <div class="discover-left">
        <div class="console-identity-block">
          <ConsoleReticle :key="target" icon="i-lucide-link" />
          <div class="console-name">
            <span class="console-label">Domain / <span class="console-label-key">provider=all</span></span>
            <h3 class="console-name-mono discover-name">{{ target }}</h3>
            <p class="console-about discover-about">
              {{ urls.length }} unique URLs from {{ answered }} of {{ PROVIDERS.length }} sources, at
              most {{ sample?.limit }} each. Nobody visited the site to get them.
            </p>
          </div>
        </div>

        <!-- The site as the sources remember it: one row per first path segment, biggest first. -->
        <div class="discover-paths">
          <p class="console-label console-rule-title">
            <span>Paths <span aria-hidden="true">[ by first segment ]</span></span>
            <span class="console-mark" aria-hidden="true" />
          </p>
          <ol :key="target" class="discover-branches console-animate" aria-label="URLs per first path segment">
            <li v-for="(branch, row) in branches" :key="row" :data-empty="!branch">
              <template v-if="branch">
                <UTooltip :text="`${branch.path}: ${branch.count} URLs`">
                  <span class="discover-path" tabindex="0">{{ branch.path }}</span>
                </UTooltip>
                <span class="discover-bar" aria-hidden="true"
                  ><span :style="{ transform: `scaleX(${branch.count / peak})` }"
                /></span>
                <span class="discover-count">{{ branch.count }}</span>
              </template>
            </li>
          </ol>
        </div>
      </div>

      <div class="console-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>URLs</dt>
            <dd class="console-accent">{{ urls.length }}</dd>
          </div>
          <div>
            <dt>Answered</dt>
            <dd>{{ answered }} of {{ PROVIDERS.length }}</dd>
          </div>
          <div>
            <dt>Seen</dt>
            <dd>{{ seenSpan(urls) }}</dd>
          </div>
          <div>
            <dt>In 2+ sources</dt>
            <dd>{{ shared }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Sources <span aria-hidden="true">[ answered · empty · failed ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ProviderCells :sample="sample" />
    </div>

    <footer class="console-footer console-footer-plain">
      <NuxtLink :to="{ path: '/discover', query: { domain: target } }" class="discover-open"
        ><span aria-hidden="true">→ </span>open {{ target }} in the explorer</NuxtLink
      >
      <div class="console-controls" aria-label="Sample domains">
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-left"
          aria-label="Previous domain"
          @click="emit('step', -1)"
        />
        <span>Domain</span>
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-right"
          aria-label="Next domain"
          @click="emit('step', 1)"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.landing-discover {
  text-align: left;
}
.discover-left {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 18px;
  min-width: 0;
}
.discover-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.discover-about {
  font-size: 14px;
}
.discover-paths > .console-rule-title {
  margin-bottom: 8px;
}
/* One row per branch at a fixed height; an empty slot keeps the band the same for every sample. */
.discover-branches {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.discover-branches > li {
  display: grid;
  grid-template-columns: minmax(0, 13rem) minmax(0, 1fr) 2.5rem;
  gap: 10px;
  align-items: center;
  height: 20px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 20px;
}
.discover-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.discover-bar {
  height: 7px;
  box-shadow: inset 0 -1px 0 var(--console-line);
}
.discover-bar > span {
  display: block;
  height: 100%;
  transform-origin: left;
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-text-muted) 55%, transparent) 0 1px,
    transparent 1px 4px
  );
  box-shadow: inset 0 0 0 1px var(--console-line);
  transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.discover-branches > li:first-child .discover-bar > span {
  background: color-mix(in srgb, var(--console-accent) 35%, transparent);
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.discover-count {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}
.landing-discover > .console-footer {
  flex-wrap: nowrap;
}
.discover-open {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.discover-open:hover {
  color: var(--console-accent);
}
.discover-open:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
@media (width < 640px) {
  .discover-branches > li {
    grid-template-columns: minmax(0, 1fr) 4rem 2rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .discover-bar > span {
    transition: none;
  }
}
</style>
