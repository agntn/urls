<script setup lang="ts">
import { sourceCells, type DiscoverSample } from "../utils/discover";
import { providerInfo } from "../utils/providers";

/**
 * Every registered source as a cell whose node carries what it did in one comparison: answered,
 * answered with nothing, or failed. The count and the reason sit in the tooltip, not on the page.
 */
const props = defineProps<{ sample: DiscoverSample | undefined }>();

const cells = computed(() =>
  sourceCells(props.sample).map((cell) => {
    const provider = providerInfo(cell.key)!;
    const note =
      cell.state === "ok"
        ? `${cell.count} URLs${cell.hasMore ? ", more behind the limit" : ""}`
        : cell.state === "empty"
          ? "answered, nothing for this domain"
          : cell.state === "waiting"
            ? "not answered yet"
            : (cell.error ?? "failed");
    return { ...cell, label: provider.label, icon: provider.icon, to: provider.to, note };
  }),
);
</script>

<template>
  <div class="cells-frame">
    <ul class="cells" aria-label="Sources in this comparison">
      <li v-for="cell in cells" :key="cell.key" :data-state="cell.state">
        <UTooltip :text="`${cell.label}: ${cell.note}`">
          <NuxtLink :to="cell.to" class="cell">
            <UIcon :name="cell.icon" class="cell-glyph" aria-hidden="true" />
            <span class="cell-name">{{ cell.label }}</span>
            <span class="cell-node" aria-hidden="true" />
            <span class="sr-only">{{ cell.note }}</span>
          </NuxtLink>
        </UTooltip>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cells-frame {
  container-type: inline-size;
}
.cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cell {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 7px;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ui-text-dimmed);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.cell-glyph {
  width: 14px;
  height: 14px;
}
.cell-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-node {
  width: 7px;
  height: 7px;
  box-shadow: inset 0 0 0 1px var(--console-corner);
}
[data-state="ok"] .cell {
  color: var(--ui-text-highlighted);
}
[data-state="ok"] .cell-glyph {
  color: var(--ui-text-muted);
}
[data-state="ok"] .cell-node {
  background: var(--ui-text-highlighted);
  box-shadow: none;
}
[data-state="empty"] .cell {
  color: var(--ui-text-muted);
}
[data-state="empty"] .cell-node {
  background: repeating-linear-gradient(135deg, var(--console-corner) 0 1px, transparent 1px 3px);
}
[data-state="failed"] .cell {
  color: var(--ui-text-muted);
}
[data-state="failed"] .cell-node {
  background: var(--urls-del);
  box-shadow: none;
}
.cell:hover {
  color: var(--console-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
/* Beside the text at 1024px an instrument is about 24rem wide: the glyph goes, three columns stay. */
@container (width < 27rem) {
  .cells {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .cell {
    grid-template-columns: minmax(0, 1fr) 7px;
  }
  .cell-glyph {
    display: none;
  }
}
.cell:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
