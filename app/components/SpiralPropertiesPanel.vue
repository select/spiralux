<script setup lang="ts">
/**
 * SpiralPropertiesPanel — shows 4 property curve editors for the active path's spiral.
 */
const { path: activePath, pushUndo } = useBezierStore();

function toggleSpiral() {
  if (!activePath.value) return;
  pushUndo();
  activePath.value.spiral.enabled = !activePath.value.spiral.enabled;
}
</script>

<template>
  <div v-if="activePath" class="flex flex-col gap-0.5">
    <!-- Header -->
    <div class="flex items-center gap-2 px-1 py-0.5">
      <button
        class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-colors"
        :class="activePath.spiral.enabled ? 'text-accent' : 'text-muted'"
        @click="toggleSpiral"
      >
        <i :class="activePath.spiral.enabled ? 'i-mdi-eye-outline' : 'i-mdi-eye-off-outline'" class="text-sm" />
        Spiral
      </button>
      <span class="text-[9px] text-muted">click to add · right-click or dbl-click node to remove · shift+handle breaks symmetry</span>
    </div>

    <!-- Property curve editors in a responsive grid -->
    <div
      class="flex flex-wrap gap-1 transition-opacity duration-200"
      :class="activePath.spiral.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'"
    >
      <div class="min-w-[min(560px,100%)] max-w-[min(560px,100%)] flex-1"><PropertyCurveEditor :curve="activePath.spiral.radius" :height="56" /></div>
      <div class="min-w-[min(560px,100%)] max-w-[min(560px,100%)] flex-1"><PropertyCurveEditor :curve="activePath.spiral.elliptic" :height="56" /></div>
      <div class="min-w-[min(560px,100%)] max-w-[min(560px,100%)] flex-1"><PropertyCurveEditor :curve="activePath.spiral.orientation" :height="56" /></div>
      <div class="min-w-[min(560px,100%)] max-w-[min(560px,100%)] flex-1"><PropertyCurveEditor :curve="activePath.spiral.frequency" :height="56" /></div>
      <div class="min-w-[min(560px,100%)] max-w-[min(560px,100%)] flex-1"><PropertyCurveEditor :curve="activePath.spiral.speed" :height="56" /></div>
    </div>
  </div>
</template>
