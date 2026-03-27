<script setup lang="ts">
import { showHelp } from "../store";

const shortcuts = [
  { key: "Space",  action: "Play / Pause" },
  { key: "R",      action: "Reset to defaults" },
  { key: "C",      action: "Clear canvas" },
  { key: "L",      action: "Toggle Live mode" },
  { key: "M",      action: "Toggle Machine diagram" },
  { key: "E",      action: "Export PNG" },
  { key: "H / ?",  action: "Show / hide this help" },
  { key: "Esc",    action: "Close help" },
];
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showHelp"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showHelp = false"
      >
        <div class="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-[0_16px_48px_var(--color-shadow)] overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 class="text-sm font-semibold text-primary tracking-tight">⌨️ Keyboard Shortcuts</h2>
            <button
              class="w-6 h-6 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-elevated transition-colors cursor-pointer text-xs"
              @click="showHelp = false"
            >✕</button>
          </div>

          <!-- Shortcut list -->
          <div class="p-5 space-y-1">
            <div
              v-for="s in shortcuts"
              :key="s.key"
              class="flex items-center justify-between py-1.5"
            >
              <span class="text-xs text-secondary">{{ s.action }}</span>
              <kbd class="px-2 py-0.5 rounded-md bg-elevated border border-border text-[11px] font-mono text-primary tabular-nums">
                {{ s.key }}
              </kbd>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 pb-4">
            <p class="text-[11px] text-muted">
              Shortcuts are disabled when an input is focused.
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
