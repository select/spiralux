<script setup lang="ts">
import type { TargetInfo } from "~/utils/targets";

defineProps<{
  target: TargetInfo;
  count?: number;
}>();
</script>

<template>
  <div class="rounded-xl border-2 border-accent/50 overflow-hidden bg-surface flex flex-col animate-fade-in shadow-sm">
    <div class="relative aspect-square overflow-hidden" :style="{ background: target.bg }">
      <img :src="`/target/${target.file}`" :alt="target.label" class="w-full h-full object-contain" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <span class="absolute top-2 left-2 text-[10px] font-bold text-white bg-accent/90 rounded-md px-2 py-1 shadow">🎯 TARGET</span>
      <span class="absolute top-2 right-2 text-[10px] text-white/70 bg-black/40 rounded px-1.5 py-0.5">{{ difficultyStars(target.difficulty) }}</span>
    </div>
    <div class="px-3 py-2.5">
      <div class="text-xs font-semibold text-primary">{{ target.label }}</div>
      <div class="text-[10px] text-muted mt-0.5">{{ target.description }}</div>
      <div v-if="count !== undefined" class="text-[10px] text-accent/70 mt-1">{{ count }} experiments</div>
    </div>
  </div>
</template>
