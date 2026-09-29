<script setup lang="ts">
import { sourceCells, toolText, type DiscoverSample } from "../../utils/discover";
import { PROVIDERS } from "../../utils/providers";

const props = defineProps<{ target: string; sample: DiscoverSample | undefined }>();

const cells = computed(() => sourceCells(props.sample));
const urls = computed(() => cells.value.reduce((sum, cell) => sum + cell.count, 0));
const more = computed(() => cells.value.filter((cell) => cell.hasMore).length);
const failed = computed(() => cells.value.filter((cell) => cell.state === "failed").length);
const text = computed(() => (props.sample ? toolText(props.sample) : ""));
</script>

<template>
  <section class="tool-console landing-call" aria-label="One tool call">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`urls_discover({ domain: &quot;${target}&quot;, provider: &quot;all&quot;, limit: ${sample?.limit} })`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>urls_discover(<span class="tok-str">"{{ target }}"</span>)</span
        >
      </UTooltip>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="target" class="console-cursor" />
    </div>

    <!-- The tool on the crosses grid; what its text says in the readout. -->
    <div class="call-subject">
      <div :key="target" class="console-scan" aria-hidden="true" />
      <div class="call-identity">
        <ConsoleReticle :key="target" icon="i-lucide-terminal" />
        <div class="call-name">
          <span class="console-label">Tool / read-only</span>
          <h3>urls_discover</h3>
          <p class="call-note">
            A page per source with its count and a flag when there was more. A failed source says
            why.
          </p>
        </div>
      </div>
      <div class="console-readout">
        <dl :key="target" class="console-readout-rows console-animate">
          <div>
            <dt>urls</dt>
            <dd class="console-accent">{{ urls }}</dd>
          </div>
          <div>
            <dt>pages</dt>
            <dd>
              <span class="call-line">{{ more }} with hasMore · {{ failed }} with an error</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <ConsoleResponse
      :title="`urls_discover(&quot;${target}&quot;)`"
      :text="text"
      source="content[0].text"
      description="The text an MCP client receives for this call, recorded through the same executor."
    />

    <footer class="console-footer console-footer-plain">
      <span aria-label="Supported hosts: MCP, AI SDK, Pi and OMP">MCP · AI SDK · Pi · OMP</span>
      <span class="console-meta">urls mcp · stdio</span>
    </footer>
  </section>
</template>

<style scoped>
.call-subject {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 18px 20px 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cpath d='M16 18h4m-2-2v4' fill='none' stroke='%23818a94' stroke-opacity='.1'/%3E%3C/svg%3E");
  background-size: 36px 36px;
  background-position: 24px 20px;
}
.call-subject > :not(.console-scan) {
  position: relative;
}
.call-identity {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}
.call-name {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.call-name h3 {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 400;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.call-note {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.landing-call .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.landing-call .console-readout-rows dt {
  text-transform: none;
  letter-spacing: 0.02em;
}
.call-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (width < 400px) {
  .call-subject {
    padding-inline: 14px;
  }
  .call-identity {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
