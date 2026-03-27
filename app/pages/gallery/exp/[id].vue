<script setup lang="ts">
import type { Experiment } from "~/utils/experiments";
import type { TargetInfo } from "~/utils/targets";

const route = useRoute();
const id = computed(() => parseInt(route.params.id as string));

const { data: exp, status, error } = useFetch<Experiment>(() => `/api/experiments/${id.value}`);
const { data: targets } = useFetch<TargetInfo[]>("/api/targets");
const { data: allExperiments } = useFetch<Experiment[]>("/api/experiments");

const { applyExperiment } = useStore();

const target = computed<TargetInfo>(() => {
  if (!exp.value) return makeTargetInfo("unknown");
  return targets.value?.find(t => t.file === exp.value!.target) ?? makeTargetInfo(exp.value.target);
});

// Prev/next navigation
const neighbours = computed(() => {
  if (!allExperiments.value || !exp.value) return { prev: null, next: null };
  // Filter same target experiments for prev/next
  const sameTarget = allExperiments.value
    .filter(e => e.target === exp.value!.target)
    .sort((a, b) => a.id - b.id);
  const idx = sameTarget.findIndex(e => e.id === exp.value!.id);
  return {
    prev: idx > 0 ? sameTarget[idx - 1]! : null,
    next: idx < sameTarget.length - 1 ? sameTarget[idx + 1]! : null,
  };
});

function thumbUrl(e: Experiment): string {
  if (e.pngFile) return `/output/${e.pngFile}?t=${e.id}`;
  if (e.svgFile) return `/output/${e.svgFile}?t=${e.id}`;
  return "";
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return ""; }
}

function fmtSteps(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function tableRotationDeg(e: Experiment): string {
  if (!e.tableTeeth) return "off";
  const totalTheta = e.steps * e.speed;
  const rotRad = totalTheta * (e.driveTeeth / e.tableTeeth);
  const deg = (rotRad * 180 / Math.PI) % 360;
  return `${deg.toFixed(0)}°`;
}

function evolveInStudio() {
  if (!exp.value) return;
  applyExperiment({
    id: exp.value.id,
    xArmGears: exp.value.xArmGears,
    yArmGears: exp.value.yArmGears,
    driveTeeth: exp.value.driveTeeth,
    tableTeeth: exp.value.tableTeeth,
    speed: exp.value.speed,
    lineWidth: exp.value.lineWidth,
    colors: exp.value.colors,
  });
}

// Keyboard nav
function handleKey(e: KeyboardEvent) {
  if (e.key === "ArrowLeft" && neighbours.value.prev) {
    navigateTo(`/gallery/exp/${neighbours.value.prev.id}`);
  }
  if (e.key === "ArrowRight" && neighbours.value.next) {
    navigateTo(`/gallery/exp/${neighbours.value.next.id}`);
  }
}
onMounted(() => window.addEventListener("keydown", handleKey));
onUnmounted(() => window.removeEventListener("keydown", handleKey));
</script>

<template>
  <div class="h-full flex flex-col bg-base text-primary">

    <!-- Loading / Error -->
    <div v-if="status === 'pending'" class="flex-1 flex items-center justify-center text-secondary text-sm">
      Loading experiment…
    </div>

    <div v-else-if="error || !exp" class="flex-1 flex flex-col items-center justify-center gap-3">
      <span class="text-3xl">⚠️</span>
      <p class="text-sm text-secondary">Experiment #{{ id }} not found</p>
      <NuxtLink to="/gallery" class="text-xs text-accent hover:underline">← Back to gallery</NuxtLink>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- ── Top bar ──────────────────────────────────────────────────── -->
      <div class="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-3">
        <NuxtLink :to="target.file ? `/gallery/target/${toSlug(target.label)}` : '/gallery'"
          class="text-secondary hover:text-primary text-xs transition-colors">
          ← {{ target.label }}
        </NuxtLink>

        <span class="font-mono font-bold text-primary text-sm">
          Exp #{{ String(exp.id).padStart(4, "0") }}
        </span>

        <span class="text-xs text-muted">{{ fmtTime(exp.timestamp) }}</span>

        <div class="ml-auto flex items-center gap-2">
          <NuxtLink v-if="neighbours.prev" :to="`/gallery/exp/${neighbours.prev.id}`"
            class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-2.5 py-1.5 transition-colors">
            ← #{{ String(neighbours.prev.id).padStart(4, "0") }}
          </NuxtLink>
          <NuxtLink v-if="neighbours.next" :to="`/gallery/exp/${neighbours.next.id}`"
            class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-2.5 py-1.5 transition-colors">
            #{{ String(neighbours.next.id).padStart(4, "0") }} →
          </NuxtLink>
        </div>
      </div>

      <!-- ── Main layout: image + info sidebar ────────────────────────── -->
      <div class="flex-1 min-h-0 flex">

        <!-- Image panel -->
        <div class="flex-1 min-w-0 flex items-center justify-center p-6 lg:p-12 bg-canvas">
          <img v-if="thumbUrl(exp)" :src="thumbUrl(exp)" :alt="`Experiment ${exp.id}`"
            class="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          <span v-else class="text-muted text-sm">No image</span>
        </div>

        <!-- Info panel -->
        <div class="w-72 lg:w-80 shrink-0 bg-surface border-l border-border overflow-y-auto flex flex-col">

          <!-- Evolve CTA -->
          <div class="px-5 py-4 border-b border-border">
            <button @click="evolveInStudio"
              class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-accent hover:bg-accent/90 active:scale-95 rounded-xl shadow transition-all cursor-pointer">
              🚀 Evolve in Studio
            </button>
            <p class="text-[10px] text-muted text-center mt-2">Loads all params into Studio for live tweaking</p>
          </div>

          <!-- Target reference -->
          <div class="px-5 py-3 border-b border-border">
            <div class="text-[10px] uppercase tracking-wider text-muted mb-2">🎯 Target</div>
            <NuxtLink :to="`/gallery/target/${toSlug(target.label)}`" class="flex items-center gap-3 group">
              <div class="w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0 shadow-sm" :style="{ background: target.bg }">
                <img :src="`/target/${exp.target}`" :alt="target.label" class="w-full h-full object-contain" />
              </div>
              <div>
                <div class="text-sm font-medium text-primary group-hover:text-accent transition-colors">{{ target.label }}</div>
                <div class="text-[10px] text-muted mt-0.5">{{ target.description }}</div>
                <div class="text-[10px] text-accent/70 mt-1">{{ difficultyStars(target.difficulty) }}</div>
              </div>
            </NuxtLink>
          </div>

          <!-- Color swatches -->
          <div class="px-5 py-3 border-b border-border">
            <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Colors</div>
            <div class="flex gap-1.5">
              <span v-for="color in exp.colors" :key="color"
                class="w-5 h-5 rounded-full border-2 border-white/20 shadow"
                :style="{ background: color }" :title="color" />
            </div>
          </div>

          <!-- Notes -->
          <div class="px-5 py-3 border-b border-border">
            <div class="text-[10px] uppercase tracking-wider text-muted mb-1.5">Notes</div>
            <p class="text-sm text-primary leading-relaxed">{{ exp.notes || "—" }}</p>
          </div>

          <!-- Params grid -->
          <div class="px-5 py-3 border-b border-border">
            <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Parameters</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <span class="text-muted">Steps</span><span class="text-primary font-mono">{{ fmtSteps(exp.steps) }}</span>
              <span class="text-muted">Passes</span><span class="text-primary font-mono">{{ exp.passes }}</span>
              <span class="text-muted">Drive</span><span class="text-primary font-mono">{{ exp.driveTeeth }}T</span>
              <span class="text-muted">Table</span><span class="text-primary font-mono">{{ exp.tableTeeth ? `${exp.tableTeeth}T` : 'off' }}</span>
              <span class="text-muted">Rotation</span><span class="text-primary font-mono">{{ tableRotationDeg(exp) }}</span>
              <span class="text-muted">Speed</span><span class="text-primary font-mono">{{ exp.speed }}</span>
              <span class="text-muted">Line W</span><span class="text-primary font-mono">{{ exp.lineWidth }}</span>
              <span class="text-muted">Canvas</span><span class="text-primary font-mono">{{ exp.width }}×{{ exp.height }}</span>
            </div>
          </div>

          <!-- Gear detail -->
          <div class="px-5 py-3 border-b border-border">
            <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Gear Arms</div>
            <div class="space-y-2 text-xs text-secondary font-mono">
              <div><span class="text-muted mr-1">X</span><span class="text-primary">{{ exp.xArmGears || "—" }}</span></div>
              <div><span class="text-muted mr-1">Y</span><span class="text-primary">{{ exp.yArmGears || "—" }}</span></div>
            </div>
          </div>

          <!-- File links -->
          <div class="px-5 py-3">
            <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Files</div>
            <div class="flex flex-col gap-1.5">
              <a v-if="exp.pngFile" :href="`/output/${exp.pngFile}`" target="_blank" class="text-xs text-accent hover:underline">↗ {{ exp.pngFile }}</a>
              <a v-if="exp.svgFile" :href="`/output/${exp.svgFile}`" target="_blank" class="text-xs text-accent hover:underline">↗ {{ exp.svgFile }}</a>
            </div>
          </div>

          <!-- Keyboard hint -->
          <div class="mt-auto px-5 py-3 border-t border-border text-[10px] text-muted flex gap-3">
            <span>← → navigate</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
