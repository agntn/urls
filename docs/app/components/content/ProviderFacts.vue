<script setup lang="ts">
import { PROVIDERS, providerInfo } from "../../utils/providers";

const props = defineProps<{ name: string }>();

const info = computed(() => providerInfo(props.name));
const position = computed(() => PROVIDERS.findIndex((entry) => entry.key === info.value?.key) + 1);

/**
 * The URL the provider asks, joined from its registry default and the path it adds.
 *
 * @param {string} base - The registry's default URL.
 * @param {string} path - The path the provider appends.
 * @returns {string} The endpoint as one string.
 */
function endpoint(base: string, path: string): string {
  if (base.endsWith(path)) return base;
  return `${base.replace(/\/$/, "")}${path}`;
}

/** How to reach the source from each surface, and what it needs first. */
const leads = computed(() => {
  const provider = info.value;
  if (!provider) return [];
  return [
    { tag: "Load", text: `await create("${provider.key}")` },
    { tag: "CLI", text: `urls discover example.com -p ${provider.key}` },
    {
      tag: "Key",
      text: provider.env
        ? `${provider.env.name}${provider.env.required ? ", required" : ", optional"}, or apiKey in create()`
        : "nothing, no key and no account",
    },
    { tag: "Endpoint", text: endpoint(provider.defaultUrl, provider.path) },
  ];
});
</script>

<template>
  <section v-if="info" class="tool-console console-wide not-prose my-6" aria-label="Source record">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">ID</span>{{ info.key
        }}<span v-if="position > 0" class="console-file"
          >{{ String(position).padStart(2, "0") }} / {{ PROVIDERS.length }}</span
        ></span
      >
      <span class="console-meta">{{ info.host }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

    <div class="console-band console-subject-band">
      <div class="console-scan" aria-hidden="true" />
      <div class="console-identity-block">
        <ConsoleReticle :key="info.key" :icon="info.icon" />
        <div class="console-name">
          <span class="console-label">Source</span>
          <h3>{{ info.label }}</h3>
          <ul class="facts-aliases" aria-label="Identifiers">
            <li><span class="facts-alias">provider: "{{ info.key }}"</span></li>
            <li><span class="facts-alias">{{ info.host }}</span></li>
          </ul>
          <p class="console-about">{{ info.about }}</p>
        </div>
      </div>

      <div class="console-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>Format</dt>
            <dd>{{ info.format }}</dd>
          </div>
          <div>
            <dt>Paging</dt>
            <dd>{{ info.paging }}</dd>
          </div>
          <div>
            <dt>Dates</dt>
            <dd>
              <span v-if="info.dated" class="console-accent">firstSeen · lastSeen</span>
              <span v-else class="facts-none">none, from and to skip nothing</span>
            </dd>
          </div>
          <div>
            <dt>Key</dt>
            <dd>
              <span v-if="!info.env">none</span>
              <span v-else :class="info.env.required ? '' : 'facts-none'">{{ info.env.required ? "required" : "optional" }}</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Access <span aria-hidden="true">[ library · CLI · key · endpoint ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <dl class="facts-leads">
        <dd v-for="lead in leads" :key="lead.tag" class="console-lead">
          <span class="console-tag">{{ lead.tag }}</span>
          <UTooltip :text="lead.text">
            <code class="facts-code" tabindex="0">{{ lead.text }}</code>
          </UTooltip>
          <span class="console-leader" aria-hidden="true" />
        </dd>
      </dl>
    </div>

    <footer class="console-footer console-footer-plain">
      <ul class="console-links">
        <li>
          <NuxtLink to="/providers"><span aria-hidden="true">→ </span>All sources</NuxtLink>
        </li>
        <li>
          <NuxtLink :to="{ path: '/discover', query: { provider: info.key } }"><span aria-hidden="true">→ </span>Try it in the explorer</NuxtLink>
        </li>
      </ul>
      <span class="console-meta">src/providers/{{ info.key }}.ts</span>
    </footer>
  </section>
</template>

<style scoped>
.facts-aliases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}
.facts-alias {
  display: inline-flex;
  max-width: 100%;
  padding: 1px 7px;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.facts-none {
  color: var(--ui-text-dimmed);
}
.facts-leads {
  display: grid;
  gap: 0;
  margin: 0;
}
.facts-leads > .console-lead {
  margin: 0 0 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
.facts-code {
  min-width: 0;
  overflow: hidden;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
@media (width < 640px) {
  .facts-leads .console-leader {
    display: none;
  }
}
</style>
