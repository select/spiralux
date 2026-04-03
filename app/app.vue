<script setup lang="ts">
import { loadSavedTheme } from "~/utils/themes";

onMounted(() => {
  loadSavedTheme();
});
</script>

<template>
  <div class="h-full">
    <NuxtPage class="h-full" />
  </div>
</template>
