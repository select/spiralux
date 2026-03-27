<script setup lang="ts">
import ThemeSwitcher from "./ThemeSwitcher.vue";
import GearArmControl from "./GearArmControl.vue";
import GlobalControls from "./GlobalControls.vue";
import ColorGenerator from "./ColorGenerator.vue";
import ActionButtons from "./ActionButtons.vue";
import PresetSelector from "./PresetSelector.vue";
import { config } from "../store";
</script>

<template>
  <aside
    class="w-full lg:w-80 shrink-0 overflow-y-auto bg-surface border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col gap-4 text-sm transition-colors duration-400"
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

    <!-- X Arm gear chain -->
    <GearArmControl
      :arm="config.xArm"
      axis="x"
      label="X Arm (horizontal)"
      dot-class="bg-rose-400"
      :style="{ animationDelay: '80ms' }"
    />

    <!-- Y Arm gear chain -->
    <GearArmControl
      :arm="config.yArm"
      axis="y"
      label="Y Arm (vertical)"
      dot-class="bg-sky-400"
      :style="{ animationDelay: '130ms' }"
    />

    <!-- Drive & Table -->
    <GlobalControls :style="{ animationDelay: '180ms' }" />

    <!-- Color -->
    <ColorGenerator :style="{ animationDelay: '230ms' }" />

    <!-- Actions -->
    <ActionButtons :style="{ animationDelay: '280ms' }" />

    <div class="h-2 shrink-0" />
  </aside>
</template>
