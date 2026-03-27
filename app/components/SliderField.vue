<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: number;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
}>(), {
  decimals: 2,
});

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

function onInput(e: Event) {
  emit("update:modelValue", parseFloat((e.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-center justify-between">
      <span class="text-secondary text-xs">{{ label }}</span>
      <span class="tabular-nums text-[11px] text-muted min-w-[40px] text-right">
        {{ modelValue.toFixed(decimals) }}
      </span>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      class="w-full h-1 rounded-full bg-muted/20 hover:bg-muted/30 outline-none transition-colors cursor-pointer"
      @input="onInput"
    />
  </div>
</template>
