<script setup lang="ts">
import SliderField from "./SliderField.vue";
import { addGear, removeGear } from "../store";
import type { GearArm } from "../engine";

const props = defineProps<{
  arm: GearArm;
  axis: "x" | "y";
  label: string;
  dotClass: string;
}>();

const gearLabels = ["①", "②", "③", "④"];
</script>

<template>
  <div
    class="rounded-xl bg-elevated/50 border border-border p-3 space-y-3 backdrop-blur-sm shadow-[0_2px_8px_var(--color-shadow)] hover:border-border-focus transition-all duration-200 animate-fade-in"
  >
    <!-- Arm header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full" :class="dotClass" />
        <span class="text-[10px] font-semibold uppercase tracking-widest text-muted">
          {{ label }}
        </span>
        <span class="text-[10px] text-muted/60">
          {{ arm.gears.length }} gear{{ arm.gears.length > 1 ? "s" : "" }}
        </span>
      </div>
      <div class="flex gap-1">
        <button
          v-if="arm.gears.length < 4"
          class="w-6 h-6 rounded-md bg-accent/10 text-accent text-xs font-bold flex items-center justify-center cursor-pointer hover:bg-accent/20 transition-colors"
          title="Add gear"
          @click="addGear(axis)"
        >
          +
        </button>
      </div>
    </div>

    <!-- Gear chain -->
    <div
      v-for="(gear, gi) in arm.gears"
      :key="gi"
      class="relative pl-4 border-l-2 border-border/40 space-y-2"
    >
      <!-- Belt connection indicator -->
      <div v-if="gi > 0" class="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-red-400/60" title="Belt connection" />

      <!-- Gear header -->
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-medium text-secondary">
          {{ gearLabels[gi] }} Gear · {{ gear.teeth }}T
        </span>
        <button
          v-if="arm.gears.length > 1"
          class="w-5 h-5 rounded text-[10px] text-muted hover:text-red-400 hover:bg-red-400/10 flex items-center justify-center cursor-pointer transition-colors"
          title="Remove gear"
          @click="removeGear(axis, gi)"
        >
          ✕
        </button>
      </div>

      <SliderField
        v-model="gear.teeth"
        label="Teeth"
        :min="10"
        :max="150"
        :step="1"
        :decimals="0"
      />
      <SliderField
        v-model="gear.crankRadius"
        label="Crank Radius"
        :min="0"
        :max="200"
        :step="1"
        :decimals="0"
      />
      <SliderField
        v-model="gear.phase"
        label="Phase"
        :min="0"
        :max="6.283"
        :step="0.01"
        :decimals="2"
      />
    </div>
  </div>
</template>
