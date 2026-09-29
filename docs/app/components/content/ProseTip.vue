<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <UrlsCallout kind="tip" :title="title"><slot mdc-unwrap="p" /></UrlsCallout>
</template>
