<script setup lang="ts">
import { DEFAULT_DISCOVER_LIMIT } from "@agntn/urls";
import type { DiscoverAnswer } from "../../shared/types/discover";
import { mergeUrls, type DiscoverSample } from "../utils/discover";
import { dateOnly, errorText, shortUrl } from "../utils/format";
import { PROVIDERS, providerInfo } from "../utils/providers";

definePageMeta({ layout: "default" });

const TITLE = "URL explorer";
const DESCRIPTION = "Run urls_discover through the docs worker. Pick a domain and a source and see the URLs and the exact text an agent gets back.";
useSeo({ title: TITLE, description: DESCRIPTION, type: "article", breadcrumbs: [{ title: TITLE, path: "/discover" }] });
defineOgImage("Docs.takumi", { headline: "Explorer", title: TITLE, description: "Run urls_discover through the docs worker and see what an agent gets back" }, { alt: "@agntn/urls explorer" });

const route = useRoute();
const router = useRouter();

/** Every field as the form holds it; lists stay comma separated strings until they're sent. */
const form = reactive({
  domain: "example.com",
  provider: "all",
  limit: String(DEFAULT_DISCOVER_LIMIT),
  match: "",
  filter: "",
  ext: "",
  urlScope: "",
  urlOutScope: "",
  from: "",
  to: "",
  hasQuery: false,
});

const providerItems = [
  { label: "All sources", value: "all", icon: "i-lucide-layers" },
  ...PROVIDERS.map((provider) => ({ label: provider.label, value: provider.key, icon: provider.icon })),
];
const pickedProvider = computed(() => providerItems.find((item) => item.value === form.provider));

const state = reactive<{ loading: boolean; error?: string; answer?: DiscoverAnswer; domain?: string }>({ loading: false });
const needle = ref("");

/** The comparison as a sample, so the source cells read it the way they read the landing's. */
const sample = computed<DiscoverSample | undefined>(() => {
  const answer = state.answer;
  if (answer?.mode !== "comparison") return undefined;
  return { target: state.domain ?? "", limit: Number(form.limit), fetchedAt: answer.fetchedAt, outcomes: answer.outcomes };
});

const rows = computed(() => {
  const answer = state.answer;
  if (!answer) return [];
  const all =
    answer.mode === "single"
      ? answer.page.urls.map((record) => ({ url: record.url, sources: [record.source], firstSeen: record.firstSeen }))
      : mergeUrls(sample.value);
  const term = needle.value.trim().toLowerCase();
  return term ? all.filter((row) => row.url.toLowerCase().includes(term)) : all;
});

/** One line on how the page ended, in the words of the page's own flags. */
const verdict = computed(() => {
  const answer = state.answer;
  if (answer?.mode !== "single") return "";
  const { page } = answer;
  if (page.truncated) return "The source stopped on its own with more advertised. Another source might have the rest.";
  if (page.hasMore) return `The limit of ${page.limit} cut the list. Raise it or narrow with match, ext or a URL scope.`;
  return "That's everything the source had for this query.";
});

/** The query `/api/discover` takes, empty fields left out so the cache key stays short. */
function query(): Record<string, string> {
  const entries: Record<string, string> = {
    domain: form.domain.trim(),
    provider: form.provider,
    limit: form.limit,
    match: form.match,
    filter: form.filter,
    ext: form.ext,
    urlScope: form.urlScope,
    urlOutScope: form.urlOutScope,
    from: form.from,
    to: form.to,
    hasQuery: form.hasQuery ? "true" : "",
  };
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
}

async function load() {
  if (!form.domain.trim()) return;
  const params = query();
  void router.replace({ query: params });
  state.loading = true;
  state.error = undefined;
  try {
    state.answer = await $fetch<DiscoverAnswer>("/api/discover", { retry: 0, query: params });
    state.domain = params.domain;
    needle.value = "";
  } catch (error) {
    state.answer = undefined;
    state.error = errorText(error);
  } finally {
    state.loading = false;
  }
}

/** A deep link applies once: a prerendered page hydrates with an empty query and Nuxt restores it after mount. */
let applied = false;
onMounted(() => {
  watch(
    () => route.query,
    (current) => {
      const read = (key: string) => (typeof current[key] === "string" ? (current[key] as string) : "");
      if (applied || (!read("domain") && !read("provider"))) return;
      applied = true;
      for (const key of ["domain", "provider", "limit", "match", "filter", "ext", "urlScope", "urlOutScope", "from", "to"] as const) {
        if (read(key)) form[key] = read(key);
      }
      form.hasQuery = read("hasQuery") === "true";
      if (read("domain")) void load();
    },
    { immediate: true, deep: true },
  );
});

const title = computed(() => `urls_discover("${state.domain ?? form.domain}")`);
</script>

<template>
  <div class="urls-landing not-prose">
    <ToolHero
      eyebrow="discover"
      title="Ask every source"
      accent="what it remembers."
      description="The explorer runs urls_discover through the docs worker, the same executor your agent calls. Nothing here touches the domain itself."
      circuit="urls_discover"
    >
      <template #instrument>
        <div class="discover-stack">
          <ExplorerPanel
            as="form"
            tag="Call"
            role="search"
            label="Discover URLs"
            :busy="state.loading"
            :meta="pickedProvider?.label"
            @submit.prevent="load"
          >
            <template #title>urls_discover(<span class="tok-str">"{{ form.domain || "example.com" }}"</span>)</template>
            <div class="urls-band discover-form">
              <div class="console-readout">
                <dl class="console-readout-rows">
                  <div>
                    <dt><label for="discover-domain">Domain</label></dt>
                    <dd>
                      <UInput
                        id="discover-domain"
                        v-model="form.domain"
                        variant="none"
                        placeholder="example.com"
                        autocomplete="off"
                        spellcheck="false"
                        class="w-full"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <USelectMenu
                        v-model="form.provider"
                        :items="providerItems"
                        value-key="value"
                        :icon="pickedProvider?.icon"
                        variant="none"
                        :search-input="false"
                        aria-label="Source"
                        class="w-full"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="discover-limit">Limit</label></dt>
                    <dd>
                      <UInput id="discover-limit" v-model="form.limit" variant="none" inputmode="numeric" placeholder="1 to 100" autocomplete="off" class="w-full" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="discover-scope">URL scope</label></dt>
                    <dd>
                      <UInput id="discover-scope" v-model="form.urlScope" variant="none" placeholder="*example.com/api*" autocomplete="off" spellcheck="false" class="w-full" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="discover-out">Out of scope</label></dt>
                    <dd>
                      <UInput id="discover-out" v-model="form.urlOutScope" variant="none" placeholder="*/static/*" autocomplete="off" spellcheck="false" class="w-full" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="discover-match">Match</label></dt>
                    <dd class="discover-pair">
                      <UInput id="discover-match" v-model="form.match" variant="none" placeholder="keep: api, admin" autocomplete="off" spellcheck="false" />
                      <UInput v-model="form.filter" variant="none" placeholder="drop: logout" autocomplete="off" spellcheck="false" aria-label="Drop" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="discover-ext">Extension</label></dt>
                    <dd class="discover-pair">
                      <UInput id="discover-ext" v-model="form.ext" variant="none" placeholder="js, json" autocomplete="off" spellcheck="false" />
                      <UCheckbox v-model="form.hasQuery" label="has query" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="discover-from">Seen</label></dt>
                    <dd class="discover-pair">
                      <UInput id="discover-from" v-model="form.from" variant="none" placeholder="from 2019" autocomplete="off" aria-label="From" />
                      <UInput v-model="form.to" variant="none" placeholder="to 2024" autocomplete="off" aria-label="To" />
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <UButton type="submit" color="primary" variant="solid" :loading="state.loading" trailing-icon="i-lucide-radar" label="Discover" />
              </div>
            </div>
            <template #footer>
              <span>Lists are comma separated. Answers are cached for six hours, so a repeat is instant.</span>
            </template>
          </ExplorerPanel>

          <ExplorerPanel v-if="state.error" tag="Error" title="urls_discover" label="Discovery failed">
            <div class="urls-band">
              <p class="urls-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
            </div>
          </ExplorerPanel>

          <template v-else-if="state.answer">
            <ExplorerPanel
              v-if="state.answer.mode === 'comparison'"
              tag="Log"
              title="sources"
              label="Sources in this comparison"
              :sweep="state.answer.fetchedAt"
              :meta="`fetched ${dateOnly(state.answer.fetchedAt)}`"
            >
              <div class="urls-band">
                <ProviderCells :sample="sample" />
              </div>
            </ExplorerPanel>

            <ExplorerPanel
              tag="List"
              label="Discovered URLs"
              :sweep="state.answer.fetchedAt"
              :meta="state.answer.mode === 'single' ? `${state.answer.page.count} urls · ${providerInfo(state.answer.provider)?.label ?? state.answer.provider}` : `${rows.length} unique urls`"
            >
              <template #title>{{ state.domain }}</template>
              <div class="urls-band discover-filter">
                <p v-if="verdict" class="discover-verdict">{{ verdict }}</p>
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <div>
                      <dt><label for="discover-needle">Find</label></dt>
                      <dd>
                        <UInput id="discover-needle" v-model="needle" type="search" variant="none" icon="i-lucide-search" placeholder="in these URLs" autocomplete="off" class="w-full" />
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <ul class="urls-rows discover-rows">
                <li v-for="row in rows" :key="row.url">
                  <UTooltip :text="row.url">
                    <span class="discover-url" tabindex="0">{{ shortUrl(row.url, 96) }}</span>
                  </UTooltip>
                  <span class="discover-seen">{{ row.firstSeen ? dateOnly(row.firstSeen) : "undated" }}</span>
                  <span class="discover-sources">{{ row.sources.join(" · ") }}</span>
                </li>
              </ul>
              <p v-if="!rows.length" class="urls-note discover-empty">
                {{ needle ? "Nothing here matches that." : "The source answered with nothing for this query." }}
              </p>
              <ConsoleResponse
                :title="title"
                :text="state.answer.text"
                source="content[0].text"
                description="The text an MCP client receives for this call, from the same executor."
              />
            </ExplorerPanel>
          </template>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.discover-stack {
  display: grid;
  gap: 28px;
}
.discover-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.discover-form {
  display: grid;
  gap: 16px;
}
.discover-form .console-readout-rows > div,
.discover-filter .console-readout-rows > div {
  grid-template-columns: 7.5rem minmax(0, 1fr);
}
.discover-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}
.discover-filter {
  display: grid;
  gap: 12px;
}
.discover-verdict {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--ui-text-muted);
}
.discover-rows > li {
  grid-template-columns: minmax(0, 1fr) 6.5rem minmax(0, 12rem);
  align-items: center;
}
.discover-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.discover-seen,
.discover-sources {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
.discover-empty {
  padding: 0 20px 16px;
}
@media (width < 52rem) {
  .discover-rows > li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .discover-url {
    grid-column: 1 / -1;
  }
}
@media (width < 640px) {
  .discover-form .console-readout-rows > div,
  .discover-filter .console-readout-rows > div {
    grid-template-columns: 5.5rem minmax(0, 1fr);
  }
  .discover-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
