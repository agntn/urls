<script setup lang="ts">
import { DEFAULT_DISCOVER_LIMIT } from "@agntn/urls";
import { PROVIDERS } from "../../utils/providers";

const { samples, index, current, target, paused, step } = useLandingDiscover();

/** Sources that refuse to answer without a key, named from the registry. */
const keyed = PROVIDERS.filter((provider) => provider.requiresKey)
  .map((provider) => provider.label)
  .join(" and ");
</script>

<template>
  <div class="urls-landing not-prose">
    <LandingHero
      :target="target"
      :sample="current"
      :position="index"
      :total="samples.length"
      @step="step"
      @pause="paused = $event"
    />

    <LandingFeature
      title="Keep the URLs you came for"
      to="/guide/filters"
      link="Filters and scope"
      :checks="[
        'Default scope keeps the domain and its subdomains, nothing else',
        'Prefix or glob over the full URL, extension, query keys, substrings',
        'Dates bound what an archive saw, undated hits stay in',
      ]"
    >
      A popular domain has tens of thousands of archived URLs, and a good share of them is fonts, tracking
      junk and templates somebody forgot to render. Filters run inside every source as the URLs
      stream in, so a limit counts what you kept, not what you threw away. Try the chips, it's the
      real collector running on the sample above.
      <template #visual>
        <LandingFilter :target="target" :sample="current" />
      </template>
    </LandingFeature>

    <section class="urls-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <div class="max-w-2xl">
          <h2 class="text-2xl font-medium tracking-tight text-highlighted sm:text-[1.75rem]">
            {{ PROVIDERS.length }} sources, one record shape
          </h2>
          <p class="mt-4 text-sm leading-6 text-muted">
            CDX text, CDX NDJSON, paged JSON, search cursors. Each provider turns its own format into
            the same record: the URL, which source saw it, and when, if the source keeps dates.
            Modules load lazily, so asking Wayback alone never pulls in the other
            {{ PROVIDERS.length - 1 }}. Only {{ keyed }} insists on a key.
          </p>
          <p class="landing-entry">
            <span class="console-tag">Load</span>
            <code>await create("wayback")</code>
          </p>
        </div>
        <ProviderRoster class="mt-10" />
      </div>
    </section>

    <LandingFeature
      title="Two tools for your agent"
      to="/guide/agents"
      link="MCP server and extensions"
      :checks="[
        'urls_discover and urls_providers on MCP, AI SDK, Pi and OMP',
        `${DEFAULT_DISCOVER_LIMIT} URLs per source unless the agent asks for more`,
        'hasMore says when the limit cut the list, truncated when the source did',
      ]"
      reverse
    >
      An agent doesn't need tens of thousands of URLs in its context. It gets a bounded page per source
      and a flag saying there's more, so it can narrow the call instead of drowning in it. Every
      host runs the same executor, so the answer is the same wherever you plug it in.
      <template #visual>
        <LandingToolCall :target="target" :sample="current" />
      </template>
    </LandingFeature>

    <section class="urls-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <LandingStart />
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-entry {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 20px 0 0;
  min-width: 0;
}
.landing-entry > .console-tag {
  flex: none;
  margin: 0;
}
.landing-entry > code {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
</style>
