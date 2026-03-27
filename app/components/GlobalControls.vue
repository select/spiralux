<script setup lang="ts">
const { config } = useStore();
</script>

<template>
  <div
    class="rounded-xl bg-elevated/50 border border-border p-3 space-y-2.5 backdrop-blur-sm shadow-[0_2px_8px_var(--color-shadow)] hover:border-border-focus transition-all duration-200 animate-fade-in"
  >
    <span class="text-[10px] font-semibold uppercase tracking-widest text-muted">
      Drive &amp; Table
    </span>

    <div class="grid grid-cols-2 gap-x-4 gap-y-2.5">
      <SliderField
        v-model="config.driveTeeth"
        label="Drive Teeth"
        :min="5"
        :max="80"
        :step="1"
        :decimals="0"
      />
      <SliderField
        v-model="config.tableTeeth"
        label="Table Teeth (0=off)"
        :min="0"
        :max="400"
        :step="1"
        :decimals="0"
      />
      <SliderField
        v-model="config.speed"
        label="Speed"
        :min="0.002"
        :max="0.1"
        :step="0.002"
      />
      <SliderField
        v-model="config.lineWidth"
        label="Line Width"
        :min="0.2"
        :max="4"
        :step="0.1"
        :decimals="1"
      />
    </div>
  </div>
</template>
