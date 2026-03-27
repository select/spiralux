<script setup lang="ts">
import CanvasView from "./components/CanvasView.vue";
import Sidebar from "./components/Sidebar.vue";
</script>

<template>
  <div class="h-full flex flex-col lg:flex-row">
    <CanvasView class="flex-1 min-h-0" />
    <Sidebar />
  </div>
</template>
