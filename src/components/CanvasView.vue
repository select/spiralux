<script setup lang="ts">
import { onMounted, ref, watch, toRaw } from "vue";
import { Renderer } from "../renderer";
import { config, colorState, rendererRef, running, motorTheta, showMachine } from "../store";
import MachineView from "./MachineView.vue";

const canvasEl = ref<HTMLCanvasElement | null>(null);

onMounted(() => {
  if (!canvasEl.value) return;
  const renderer = new Renderer(canvasEl.value, toRaw(config), toRaw(colorState));
  rendererRef.value = renderer;
  renderer.onStop(() => { running.value = false; });
  renderer.onFrame((theta) => { motorTheta.value = theta; });
  renderer.start();
  running.value = true;
});

watch(config, () => rendererRef.value?.setConfig(toRaw(config)), { deep: true });
watch(colorState, () => rendererRef.value?.setColorState(toRaw(colorState)), { deep: true });
</script>

<template>
  <main class="relative p-3 flex flex-col gap-3">
    <div
      class="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-canvas shadow-[inset_0_2px_20px_var(--color-shadow)] transition-colors duration-400"
    >
      <canvas ref="canvasEl" class="absolute inset-0 w-full h-full" />
    </div>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-60"
      leave-from-class="opacity-100 max-h-60"
      leave-to-class="opacity-0 max-h-0"
    >
      <div
        v-if="showMachine"
        class="h-48 shrink-0 rounded-2xl overflow-hidden bg-canvas/60 border border-border backdrop-blur-sm shadow-[0_2px_8px_var(--color-shadow)] transition-colors duration-400"
      >
        <MachineView />
      </div>
    </Transition>
  </main>
</template>
