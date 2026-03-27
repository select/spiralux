<script setup lang="ts">
import type { Experiment } from "~/utils/experiments";
import type { TargetInfo } from "~/utils/targets";

const props = defineProps<{
  exp: Experiment;
  target: TargetInfo;
  showTargetLabel?: boolean;
}>();

const { applyExperiment } = useStore();

function thumbUrl(exp: Experiment): string {
  if (exp.pngFile) return `/output/${exp.pngFile}?t=${exp.id}`;
  if (exp.svgFile) return `/output/${exp.svgFile}?t=${exp.id}`;
  return "";
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

function fmtSteps(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function tableRotationDeg(exp: Experiment): string {
  if (!exp.tableTeeth) return "off";
  const totalTheta = exp.steps * exp.speed;
  const rotRad = totalTheta * (exp.driveTeeth / exp.tableTeeth);
  const deg = (rotRad * 180 / Math.PI) % 360;
  return `${deg.toFixed(0)}°`;
}

function toSnapshot(exp: Experiment) {
  return {
    id: exp.id,
    xArmGears: exp.xArmGears,
    yArmGears: exp.yArmGears,
    driveTeeth: exp.driveTeeth,
    tableTeeth: exp.tableTeeth,
    speed: exp.speed,
    lineWidth: exp.lineWidth,
    colors: exp.colors,
  };
}

function evolveInStudio(exp: Experiment) {
  applyExperiment(toSnapshot(exp));
}
</script>

<template>
  <div class="rounded-xl border border-border overflow-hidden bg-surface flex flex-col cursor-pointer hover:border-border-focus hover:shadow-lg transition-all duration-200 animate-fade-in group">
    <NuxtLink :to="`/gallery/exp/${exp.id}`" class="contents">
      <div class="relative aspect-square bg-canvas overflow-hidden">
        <img v-if="thumbUrl(exp)" :src="thumbUrl(exp)" :alt="`Experiment ${exp.id}`"
          class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" loading="lazy" />
        <div v-else class="w-full h-full flex items-center justify-center text-muted text-xs">No image</div>

        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />

        <!-- ID badge -->
        <div class="absolute top-2 left-2 flex flex-col gap-1">
          <span class="text-xs font-mono font-bold text-white/90 bg-black/50 rounded px-1.5 py-0.5">
            #{{ String(exp.id).padStart(4, "0") }}
          </span>
        </div>

        <!-- Evolve overlay -->
        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto z-10">
          <button @click.prevent.stop="evolveInStudio(exp)"
            class="flex items-center gap-1.5 text-xs font-bold text-white bg-accent/90 hover:bg-accent rounded-full px-3.5 py-2 shadow-xl backdrop-blur-sm transition-all scale-90 group-hover:scale-100 duration-200">
            🚀 Evolve in Studio
          </button>
        </div>

        <!-- Color swatches -->
        <div class="absolute top-2 right-2 flex gap-1">
          <span v-for="color in exp.colors" :key="color"
            class="w-3 h-3 rounded-full border border-white/30 shadow" :style="{ background: color }" />
        </div>

        <!-- Notes -->
        <div class="absolute bottom-0 left-0 right-14 px-2 pb-2 pt-4">
          <p class="text-xs text-white/90 line-clamp-2 leading-snug">{{ exp.notes || "—" }}</p>
        </div>

        <!-- Target thumbnail -->
        <div class="absolute bottom-2 right-2 group/target">
          <div class="w-11 h-11 rounded-lg overflow-hidden border-2 border-white/40 shadow-lg transition-transform group-hover/target:scale-110"
            :style="{ background: target.bg }">
            <img :src="`/target/${exp.target}`" :alt="target.label" class="w-full h-full object-cover opacity-80" />
          </div>
        </div>
      </div>
    </NuxtLink>

    <div class="px-2.5 py-2 flex flex-col gap-1.5 border-t border-border/50">
      <div v-if="showTargetLabel" class="flex items-center gap-1.5">
        <div class="w-4 h-4 rounded overflow-hidden border border-border/60 shrink-0" :style="{ background: target.bg }">
          <img :src="`/target/${exp.target}`" class="w-full h-full object-cover" />
        </div>
        <span class="text-[10px] text-muted truncate">{{ target.label }}</span>
      </div>
      <div class="flex items-center gap-1 flex-wrap">
        <span class="text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5 border border-border/50">{{ fmtSteps(exp.steps) }}steps</span>
        <span class="text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5 border border-border/50">{{ exp.passes }}×pass</span>
        <span class="text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5 border border-border/50">tbl {{ tableRotationDeg(exp) }}</span>
        <span class="text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5 border border-border/50">lw{{ exp.lineWidth }}</span>
      </div>
      <div class="text-[10px] text-muted truncate" :title="`X: ${exp.xArmGears}\nY: ${exp.yArmGears}`">
        X: {{ exp.xArmGears }}
      </div>
      <div class="flex items-center justify-between">
        <div class="text-[10px] text-muted">{{ fmtTime(exp.timestamp) }}</div>
        <button @click.stop="evolveInStudio(exp)"
          class="text-[10px] font-semibold text-accent opacity-0 group-hover:opacity-100 hover:underline transition-opacity"
          title="Load into Studio">
          → Studio
        </button>
      </div>
    </div>
  </div>
</template>
