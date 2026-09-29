<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <UrlsCallout kind="warning" :title="title"><slot mdc-unwrap="p" /></UrlsCallout>
</template>
