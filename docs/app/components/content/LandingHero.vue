<script setup lang="ts">
import { version } from "../../../../package.json";
import { DEFAULT_DISCOVER_LIMIT } from "@agntn/urls";
import type { DiscoverSample } from "../../utils/discover";
import { KEYLESS, PROVIDERS } from "../../utils/providers";

defineProps<{
  target: string;
  sample: DiscoverSample | undefined;
  position: number;
  total: number;
}>();

const emit = defineEmits<{
  step: [delta: number];
  pause: [value: boolean];
}>();

const INSTALL = "pnpm add @agntn/urls";

const { copied, copy } = useCopied();
</script>

<template>
  <header class="urls-hero hero-page">
    <div class="hero-zone">
      <span class="hero-cross hero-cross-tl" aria-hidden="true">+</span>
      <span class="hero-cross hero-cross-tr" aria-hidden="true">+</span>
      <span class="hero-bracket hero-bracket-l" aria-hidden="true" />
      <span class="hero-bracket hero-bracket-r" aria-hidden="true" />

      <p class="console-id">
        <span class="console-id-tag">ID</span>
        <span>@agntn/urls</span>
        <span class="console-id-sep" aria-hidden="true">/</span>
        <span>v{{ version }}</span>
      </p>

      <h1 class="hero-title">Every URL a domain<br /><span>left behind.</span></h1>
      <p class="hero-lead">
        Web archives and threat intel indexes behind one TypeScript API. Ask what they've seen for a
        domain, cut the noise with filters, and give your agent the same tools over MCP. The site
        itself never hears about it.
      </p>

      <dl class="hero-metrics">
        <div>
          <dt>Sources</dt>
          <dd>{{ PROVIDERS.length }}</dd>
          <dd class="hero-metric-sub">{{ KEYLESS.length }} keyless</dd>
        </div>
        <div>
          <dt>Agent page</dt>
          <dd class="hero-metric-accent">{{ DEFAULT_DISCOVER_LIMIT }} <span>URLs</span></dd>
          <dd class="hero-metric-sub">per source</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>2</dd>
          <dd class="hero-metric-sub">4 hosts</dd>
        </div>
      </dl>

      <div class="console-actions">
        <UButton
          to="/guide"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          label="Get started"
        />
        <UButton
          to="https://github.com/agntn/urls"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-github"
          label="Star on GitHub"
        />
      </div>
      <div class="console-install">
        <span class="console-install-tag">Install</span>
        <code><span class="console-install-prompt">$</span> {{ INSTALL }}</code>
        <UButton
          color="neutral"
          variant="subtle"
          :icon="copied === 'install' ? 'i-lucide-check' : 'i-lucide-copy'"
          :aria-label="copied === 'install' ? 'Copied' : 'Copy install command'"
          @click="copy('install', INSTALL)"
        />
      </div>
    </div>

    <div class="hero-instrument">
      <svg class="hero-circuit" viewBox="0 0 160 56" aria-hidden="true">
        <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
        <path :key="target" class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
        <path class="hero-circuit-seg" d="M96 38V48" />
        <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
      </svg>
      <span class="hero-circuit-tag" aria-hidden="true">discoverAll()</span>
      <LandingDiscover
        :target="target"
        :sample="sample"
        :position="position"
        :total="total"
        @step="emit('step', $event)"
        @pause="emit('pause', $event)"
      />
    </div>
  </header>
</template>
