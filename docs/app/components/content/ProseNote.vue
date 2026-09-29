<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <UrlsCallout kind="note" :title="title"><slot mdc-unwrap="p" /></UrlsCallout>
</template>
