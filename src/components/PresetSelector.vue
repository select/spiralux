<script setup lang="ts">
import { ref } from "vue";
import { PRESETS } from "../presets";
import { applyPreset, colorState } from "../store";
import { defaultColorState } from "../colors";

const activeId = ref<string | null>(null);

function select(presetId: string) {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return;
  activeId.value = presetId;

  const freshColor = defaultColorState();
  Object.assign(colorState, freshColor);

  applyPreset({
    xArm: p.xArm,
    yArm: p.yArm,
    driveTeeth: p.driveTeeth,
    tableTeeth: p.tableTeeth,
    color: p.color,
  });
}
</script>

<template>
  <div
    class="rounded-xl bg-elevated/50 border border-border p-3 space-y-2.5 backdrop-blur-sm shadow-[0_2px_8px_var(--color-shadow)] hover:border-border-focus transition-all duration-200 animate-fade-in"
  >
    <span class="text-[10px] font-semibold uppercase tracking-widest text-muted">
      Presets
    </span>

    <div class="grid grid-cols-5 gap-1.5">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        :title="p.name"
        class="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border cursor-pointer transition-all duration-200 hover:scale-105"
        :class="
          activeId === p.id
            ? 'border-accent/40 bg-accent/10'
            : 'border-transparent hover:bg-elevated hover:border-border'
        "
        @click="select(p.id)"
      >
        <span class="text-base leading-none">{{ p.icon }}</span>
        <span class="text-[9px] text-muted leading-tight truncate w-full text-center">{{ p.name }}</span>
      </button>
    </div>
  </div>
</template>
