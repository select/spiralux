<script setup lang="ts">
import SliderField from "./SliderField.vue";
import { colorState } from "../store";
import { PALETTES, type ColorMode } from "../colors";

const modes: { id: ColorMode; label: string }[] = [
  { id: "static", label: "Static" },
  { id: "gradient", label: "Gradient" },
  { id: "rainbow", label: "Rainbow" },
  { id: "palette", label: "Palette" },
];

function setMode(mode: ColorMode) {
  colorState.mode = mode;
}

function setPalette(id: string) {
  colorState.paletteId = id;
}
</script>

<template>
  <div
    class="rounded-xl bg-elevated/50 border border-border p-3 space-y-3 backdrop-blur-sm shadow-[0_2px_8px_var(--color-shadow)] hover:border-border-focus transition-all duration-200 animate-fade-in"
  >
    <span class="text-[10px] font-semibold uppercase tracking-widest text-muted">
      Color
    </span>

    <!-- Mode tabs -->
    <div class="flex gap-1.5 flex-wrap">
      <button
        v-for="m in modes"
        :key="m.id"
        class="px-2.5 py-1 rounded-lg text-[11px] font-medium uppercase tracking-wide border cursor-pointer transition-all duration-200"
        :class="
          colorState.mode === m.id
            ? 'text-primary bg-accent/12 border-accent/40'
            : 'text-muted border-border hover:text-secondary hover:border-border-focus'
        "
        @click="setMode(m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <!-- Static -->
    <div v-if="colorState.mode === 'static'" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-secondary text-xs">Color</span>
        <input
          v-model="colorState.staticColor"
          type="color"
          class="w-7 h-7 rounded-lg border-2 border-border hover:border-border-focus cursor-pointer transition-colors"
        />
      </div>
    </div>

    <!-- Gradient -->
    <div v-if="colorState.mode === 'gradient'" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-secondary text-xs">From</span>
        <input
          v-model="colorState.gradientFrom"
          type="color"
          class="w-7 h-7 rounded-lg border-2 border-border hover:border-border-focus cursor-pointer transition-colors"
        />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-secondary text-xs">To</span>
        <input
          v-model="colorState.gradientTo"
          type="color"
          class="w-7 h-7 rounded-lg border-2 border-border hover:border-border-focus cursor-pointer transition-colors"
        />
      </div>
    </div>

    <!-- Rainbow -->
    <div v-if="colorState.mode === 'rainbow'" class="space-y-2">
      <SliderField
        v-model="colorState.rainbowSpeed"
        label="Cycle Speed"
        :min="0.2"
        :max="15"
        :step="0.2"
      />
      <SliderField
        v-model="colorState.rainbowSaturation"
        label="Saturation"
        :min="10"
        :max="100"
        :step="1"
      />
      <SliderField
        v-model="colorState.rainbowLightness"
        label="Lightness"
        :min="20"
        :max="90"
        :step="1"
      />
    </div>

    <!-- Palette -->
    <div v-if="colorState.mode === 'palette'" class="space-y-2">
      <div class="space-y-1">
        <button
          v-for="p in PALETTES"
          :key="p.id"
          class="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg border cursor-pointer transition-all duration-200"
          :class="
            colorState.paletteId === p.id
              ? 'border-accent/40 bg-accent/8'
              : 'border-transparent hover:bg-elevated'
          "
          @click="setPalette(p.id)"
        >
          <span class="text-[11px] text-secondary w-10 shrink-0">{{ p.name }}</span>
          <div class="flex rounded overflow-hidden h-3.5 flex-1">
            <span
              v-for="(c, ci) in p.colors"
              :key="ci"
              class="flex-1"
              :style="{ backgroundColor: c }"
            />
          </div>
        </button>
      </div>
      <SliderField
        v-model="colorState.paletteSpeed"
        label="Cycle Speed"
        :min="0.5"
        :max="15"
        :step="0.5"
      />
    </div>
  </div>
</template>
