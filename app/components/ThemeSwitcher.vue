<script setup lang="ts">
import { THEMES, applyTheme, getCurrentTheme } from "~/utils/themes";
import { ref } from "vue";

const active = ref(getCurrentTheme().id);

function select(id: string) {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return;
  applyTheme(theme);
  active.value = id;
}
</script>

<template>
  <div class="flex gap-1.5">
    <button
      v-for="t in THEMES"
      :key="t.id"
      :title="t.name"
      class="inline-flex items-center justify-center w-8 h-8 rounded-[10px] border-[1.5px] text-sm cursor-pointer transition-all duration-200 hover:scale-110"
      :class="
        active === t.id
          ? 'border-accent shadow-[0_0_0_2px_var(--color-accent-glow)] bg-accent/10'
          : 'border-border bg-elevated hover:border-border-focus'
      "
      @click="select(t.id)"
    >
      {{ t.icon }}
    </button>
  </div>
</template>
