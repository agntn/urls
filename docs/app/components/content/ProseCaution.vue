<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <UrlsCallout kind="caution" :title="title"><slot mdc-unwrap="p" /></UrlsCallout>
</template>
