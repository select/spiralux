<script setup lang="ts">
import { onMounted, ref, toRaw, watch } from "vue";
import { Renderer } from "~/utils/renderer";

const {
  config, colorState, rendererRef, running,
  motorTheta, liveMode, showHelp, showMachine,
  resetAll, exportPNG,
} = useStore();

const canvasEl = ref<HTMLCanvasElement | null>(null);

/* ---- renderer lifecycle ---- */
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

/* ---- live mode ---- */
let liveTimer: ReturnType<typeof setTimeout> | null = null;

function triggerLivePreview() {
  if (!liveMode.value) return;
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    rendererRef.value?.drawPreview();
    running.value = false;
    motorTheta.value = rendererRef.value?.getTheta() ?? 0;
  }, 160);
}

watch([config, colorState], triggerLivePreview, { deep: true });

watch(liveMode, (isLive) => {
  if (isLive) {
    rendererRef.value?.drawPreview();
    running.value = false;
    motorTheta.value = rendererRef.value?.getTheta() ?? 0;
  }
});

/* ---- actions ---- */
function togglePlay() {
  rendererRef.value?.toggle();
  running.value = rendererRef.value?.isRunning() ?? false;
}

function clearCanvas() {
  rendererRef.value?.clear();
  motorTheta.value = 0;
}
</script>

<template>
  <main class="relative p-3">
    <div
      class="relative w-full h-full rounded-2xl overflow-hidden bg-canvas shadow-[inset_0_2px_20px_var(--color-shadow)] transition-colors duration-400"
    >
      <canvas ref="canvasEl" class="absolute inset-0 w-full h-full" />

      <!-- Floating controls — bottom-right corner -->
      <div class="absolute bottom-3 right-3 flex flex-col items-end gap-2">

        <!-- Row 1: primary actions -->
        <div class="flex items-center gap-1.5 bg-base/70 backdrop-blur-md border border-border/60 rounded-xl px-2 py-1.5 shadow-[0_4px_16px_var(--color-shadow)]">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200 bg-accent text-white hover:bg-accent-hover hover:shadow-[0_0_12px_var(--color-accent-glow)] active:scale-95"
            :title="`${running ? 'Pause' : 'Play'} (Space)`"
            @click="togglePlay"
          >
            <span>{{ running ? "⏸" : "▶" }}</span>
            <span class="hidden sm:inline">{{ running ? "Pause" : "Play" }}</span>
          </button>

          <div class="w-px h-4 bg-border/60" />

          <button class="px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-elevated/60 transition-all duration-150 cursor-pointer active:scale-95" title="Clear (C)" @click="clearCanvas">🗑</button>
          <button class="px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-elevated/60 transition-all duration-150 cursor-pointer active:scale-95" title="Reset (R)" @click="resetAll">↺</button>
          <button class="px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-elevated/60 transition-all duration-150 cursor-pointer active:scale-95" title="Export PNG (E)" @click="exportPNG">📥</button>
        </div>

        <!-- Row 2: mode toggles -->
        <div class="flex items-center gap-1.5 bg-base/70 backdrop-blur-md border border-border/60 rounded-xl px-2 py-1.5 shadow-[0_4px_16px_var(--color-shadow)]">
          <button
            class="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all duration-200 active:scale-95"
            :class="liveMode ? 'bg-accent/15 text-accent border border-accent/30' : 'text-muted hover:text-secondary border border-transparent hover:border-border/60'"
            title="Live preview mode (L)" @click="liveMode = !liveMode"
          >⚡ Live</button>

          <button
            class="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all duration-200 active:scale-95"
            :class="showMachine ? 'bg-accent/15 text-accent border border-accent/30' : 'text-muted hover:text-secondary border border-transparent hover:border-border/60'"
            title="Toggle machine diagram (M)" @click="showMachine = !showMachine"
          >⚙ Mach</button>

          <div class="w-px h-4 bg-border/60" />

          <button
            class="px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted hover:text-primary border border-transparent hover:border-border/60 cursor-pointer transition-all duration-200 active:scale-95"
            title="Keyboard shortcuts (H)" @click="showHelp = !showHelp"
          >?</button>
        </div>
      </div>
    </div>
  </main>
</template>
