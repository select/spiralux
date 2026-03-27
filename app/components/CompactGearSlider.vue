<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: number;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
}>(), { decimals: 0 });

const emit = defineEmits<{ "update:modelValue": [value: number] }>();
</script>

<template>
  <div class="flex items-center gap-1.5 h-5">
    <span class="text-[10px] text-muted/70 w-3 shrink-0 text-right font-mono">{{ label }}</span>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      class="flex-1 h-0.5 rounded-full bg-muted/20 hover:bg-muted/30 cursor-pointer outline-none transition-colors"
      @input="emit('update:modelValue', parseFloat(($event.target as HTMLInputElement).value))"
    />
    <span class="tabular-nums text-[10px] text-muted w-7 shrink-0 text-right">
      {{ modelValue.toFixed(decimals) }}
    </span>
  </div>
</template>
