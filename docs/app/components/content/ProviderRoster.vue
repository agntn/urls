<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { KEYLESS, PROVIDERS, type ProviderInfo } from "../../utils/providers";
import { ROSTER_CLASS, ROSTER_TABLE_UI } from "../../utils/roster";

/** Empty until a header is clicked: the rows then keep the order of the provider table. */
const sorting = ref<{ id: string; desc: boolean }[]>([]);

const roster = useTemplateRef<HTMLElement>("roster");
useRosterFlip(
  () => roster.value,
  () => sorting.value,
);

/** What a caller has to hand over before the source answers. */
function access(row: ProviderInfo): string {
  if (!row.env) return "no key";
  return row.env.required ? "key required" : "key optional";
}

const rows = PROVIDERS.map((provider) => ({ ...provider, access: access(provider) }));
type Row = (typeof rows)[number];

const columns: TableColumn<Row>[] = [
  {
    accessorKey: "label",
    header: "Source",
    sortingFn: "text",
    meta: { class: { th: "w-[12rem]" } },
  },
  /* Narrow, the row reads name and access first, then the format, then the sentence. */
  {
    accessorKey: "format",
    header: "Format",
    enableSorting: false,
    meta: {
      class: {
        th: "w-[9rem]",
        td: "@max-[52rem]/roster:order-2 @max-[52rem]/roster:col-span-full @max-[52rem]/roster:justify-self-start",
      },
    },
  },
  {
    accessorKey: "about",
    header: "What it knows",
    enableSorting: false,
    meta: { class: { td: "@max-[52rem]/roster:order-3" } },
  },
  {
    accessorKey: "access",
    header: "Key",
    sortingFn: "text",
    meta: {
      class: {
        th: "w-[12rem]",
        td: "@max-[52rem]/roster:order-1 @max-[52rem]/roster:col-span-1! @max-[52rem]/roster:justify-self-end",
      },
    },
  },
];

const order = computed(() => {
  const [first] = sorting.value;
  if (first === undefined) return "table order";
  const label = columns.find((column) => "accessorKey" in column && column.accessorKey === first.id)?.header;
  return `by ${String(label).toLowerCase()} ${first.desc ? "descending" : "ascending"}`;
});
</script>

<template>
  <section ref="roster" class="roster not-prose my-6" aria-label="Sources">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <header :class="ROSTER_CLASS.bar">
      <span :class="ROSTER_CLASS.title">providers()</span>
      <span :class="ROSTER_CLASS.meta">{{ PROVIDERS.length }} sources · {{ order }}</span>
    </header>
    <div class="roster-ruler" aria-hidden="true" />
    <UTable
      v-model:sorting="sorting"
      :data="rows"
      :columns="columns"
      :get-row-id="(row) => row.key"
      :ui="ROSTER_TABLE_UI"
    >
      <template #label-header="{ column }"><RosterSort :column="column" label="Source" /></template>
      <template #access-header="{ column }"><RosterSort :column="column" label="Key" /></template>
      <template #label-cell="{ row }">
        <NuxtLink :to="row.original.to" :class="[ROSTER_CLASS.name, 'items-baseline']">
          <UIcon :name="row.original.icon" class="relative top-0.5 size-3.5 flex-none" aria-hidden="true" />
          <span>{{ row.original.label }}</span>
        </NuxtLink>
      </template>
      <template #format-cell="{ row }">
        <span class="text-muted">{{ row.original.format }}</span>
      </template>
      <template #about-cell="{ row }">
        <span :class="ROSTER_CLASS.about">{{ row.original.about }}</span>
      </template>
      <template #access-cell="{ row }">
        <span :class="ROSTER_CLASS.count"
          ><span :class="ROSTER_CLASS.leader" aria-hidden="true" /><span
            class="whitespace-nowrap"
            :class="row.original.env?.required ? 'text-highlighted' : 'text-dimmed'"
            >{{ row.original.access }}</span
          ></span
        >
      </template>
    </UTable>
    <footer :class="ROSTER_CLASS.footer">
      <span>{{ KEYLESS.length }} answer with nothing configured / no network</span>
      <span :class="ROSTER_CLASS.meta">create("&lt;key&gt;") loads one module</span>
    </footer>
  </section>
</template>
