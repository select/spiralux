<script setup lang="ts">
import { rendererRef, running, resetAll, exportPNG, showMachine, config } from "../store";

function toggle() {
  const r = rendererRef.value;
  if (!r) return;
  r.toggle();
  running.value = r.isRunning();
}

function clear() {
  rendererRef.value?.clear();
}
</script>

<template>
  <div class="space-y-2 animate-fade-in">
    <div class="flex gap-2">
      <button
        class="flex-1 py-2 rounded-xl bg-accent text-white font-medium text-xs shadow-[0_2px_8px_var(--color-accent-glow)] hover:bg-accent-hover hover:shadow-[0_4px_16px_var(--color-accent-glow)] hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer"
        @click="toggle"
      >
        {{ running ? "⏸ Pause" : "▶ Play" }}
      </button>
      <button
        class="flex-1 py-2 rounded-xl bg-elevated text-secondary border border-border font-medium text-xs hover:text-primary hover:border-border-focus hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer"
        @click="clear"
      >
        🗑 Clear
      </button>
      <button
        class="flex-1 py-2 rounded-xl bg-elevated text-secondary border border-border font-medium text-xs hover:text-primary hover:border-border-focus hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer"
        @click="resetAll"
      >
        ↺ Reset
      </button>
    </div>
    <div class="flex gap-2">
      <button
        class="flex-1 py-2 rounded-xl bg-elevated text-secondary border border-border font-medium text-xs hover:text-primary hover:border-border-focus hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer"
        @click="exportPNG"
      >
        📥 Export PNG
      </button>
      <button
        class="flex-1 py-2 rounded-xl border font-medium text-xs hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer"
        :class="
          showMachine
            ? 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/15'
            : 'bg-elevated text-secondary border-border hover:text-primary hover:border-border-focus'
        "
        @click="showMachine = !showMachine"
      >
        ⚙️ Machine {{ showMachine ? "On" : "Off" }}
      </button>
    </div>
  </div>
</template>
