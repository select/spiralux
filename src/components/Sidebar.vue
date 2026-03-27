<script setup lang="ts">
import ThemeSwitcher from "./ThemeSwitcher.vue";
import PresetSelector from "./PresetSelector.vue";
import MachineGearPanel from "./MachineGearPanel.vue";
import GlobalControls from "./GlobalControls.vue";
import ColorGenerator from "./ColorGenerator.vue";
</script>

<template>
  <aside
    class="w-full lg:w-[480px] shrink-0 overflow-y-auto bg-surface border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col gap-4 text-sm transition-colors duration-400"
  >
    <!-- Header -->
    <div class="flex items-center justify-between animate-fade-in">
      <h1 class="text-base font-semibold tracking-tight text-primary">
        🌀 Cycloid Machine
      </h1>
      <ThemeSwitcher />
    </div>

    <!-- Presets -->
    <PresetSelector :style="{ animationDelay: '30ms' }" />

    <!-- Machine view + Gear controls side-by-side -->
    <div
      class="animate-fade-in"
      :style="{ animationDelay: '80ms' }"
    >
      <MachineGearPanel />
    </div>

    <!-- Drive & Table globals -->
    <GlobalControls :style="{ animationDelay: '130ms' }" />

    <!-- Color generator -->
    <ColorGenerator :style="{ animationDelay: '180ms' }" />

    <div class="h-2 shrink-0" />
  </aside>
</template>
