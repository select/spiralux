<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { KNOWN_TARGETS, makeTargetInfo, difficultyStars } from "../targets";
import { applyExperiment } from "../store";
import type { ExperimentSnapshot } from "../store";
import type { TargetInfo } from "../targets";

// ── Types ────────────────────────────────────────────────────────────────────

interface Experiment {
  id: number;
  timestamp: string;
  target: string;
  mode: string;
  steps: number;
  passes: number;
  colors: string[];
  opacity: number;
  driveTeeth: number;
  xArmGears: string;
  yArmGears: string;
  tableTeeth: number;
  speed: number;
  lineWidth: number;
  width: number;
  height: number;
  background: string;
  notes: string;
  svgFile: string;
  pngFile: string;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const headers = parseCSVLine(lines[0]!);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    });
}

function mapRow(r: Record<string, string>): Experiment {
  return {
    id: parseInt(r.id!),
    timestamp: r.timestamp!,
    target: r.target ?? "IMG_6777.jpeg",
    mode: r.mode ?? "linear",
    steps: parseInt(r.steps!),
    passes: parseInt(r.passes!),
    colors: (r.colors ?? "#333").split(";"),
    opacity: parseFloat(r.opacity ?? "0.5"),
    driveTeeth: parseInt(r.drive_teeth!),
    xArmGears: r.x_arm_gears ?? "",
    yArmGears: r.y_arm_gears ?? "",
    tableTeeth: parseInt(r.table_teeth ?? "0"),
    speed: parseFloat(r.speed!),
    lineWidth: parseFloat(r.line_width!),
    width: parseInt(r.width!),
    height: parseInt(r.height!),
    background: r.background!,
    notes: r.notes ?? "",
    svgFile: r.svg_file ?? "",
    pngFile: r.png_file ?? "",
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

const experiments = ref<Experiment[]>([]);
const availableTargetFiles = ref<string[]>([]);
const search = ref("");
const sortDesc = ref(true);
const loading = ref(true);
const fetchError = ref("");
const selected = ref<Experiment | null>(null);
const filterTarget = ref<string | "all">("all");

// ── Target list (auto-discovered + known metadata) ────────────────────────────

// All targets available in data/ — loaded dynamically
const allTargets = computed<TargetInfo[]>(() => {
  if (availableTargetFiles.value.length === 0) {
    // Fallback to known targets while loading
    return KNOWN_TARGETS;
  }
  return availableTargetFiles.value.map(f => makeTargetInfo(f));
});

function getTargetInfo(file: string): TargetInfo {
  return allTargets.value.find(t => t.file === file) ?? makeTargetInfo(file);
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadTargetFiles() {
  try {
    const res = await fetch(`/targets.json?t=${Date.now()}`);
    if (res.ok) {
      const files: string[] = await res.json();
      availableTargetFiles.value = files;
    }
  } catch {
    // Fall back to known targets list
    availableTargetFiles.value = KNOWN_TARGETS.map(t => t.file);
  }
}

async function loadExperiments() {
  loading.value = true;
  fetchError.value = "";
  try {
    const res = await fetch(`/output/experiments.csv?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} — is the dev server running?`);
    const text = await res.text();
    experiments.value = parseCSV(text).map(mapRow);
  } catch (e) {
    fetchError.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadTargetFiles(), loadExperiments()]);
});

// ── Filtered / sorted list ────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = [...experiments.value];
  if (filterTarget.value !== "all") {
    list = list.filter(e => e.target === filterTarget.value);
  }
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    list = list.filter(e =>
      e.notes.toLowerCase().includes(q) ||
      String(e.id).includes(q) ||
      e.xArmGears.toLowerCase().includes(q) ||
      e.yArmGears.toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => sortDesc.value ? b.id - a.id : a.id - b.id);
  return list;
});

// Targets actually referenced by experiments (plus any active filter)
const activeTargetInfo = computed<TargetInfo | null>(() =>
  filterTarget.value !== "all" ? getTargetInfo(filterTarget.value) : null
);

// Count experiments per target
const countByTarget = computed(() => {
  const m: Record<string, number> = {};
  for (const e of experiments.value) m[e.target] = (m[e.target] ?? 0) + 1;
  return m;
});

// Targets with at least one experiment (shown in grid as reference cards)
const targetCardsToShow = computed<TargetInfo[]>(() => {
  if (filterTarget.value !== "all") {
    return [getTargetInfo(filterTarget.value)];
  }
  const seen = new Set<string>();
  const result: TargetInfo[] = [];
  for (const e of experiments.value) {
    if (!seen.has(e.target)) { seen.add(e.target); result.push(getTargetInfo(e.target)); }
  }
  return result.length ? result : [getTargetInfo(KNOWN_TARGETS[0]!.file)];
});

// ── Lightbox navigation ───────────────────────────────────────────────────────

function openLightbox(exp: Experiment) { selected.value = exp; }
function closeLightbox() { selected.value = null; }

function lightboxNext() {
  if (!selected.value) return;
  const idx = filtered.value.findIndex(e => e.id === selected.value!.id);
  if (idx < filtered.value.length - 1) selected.value = filtered.value[idx + 1]!;
}

function lightboxPrev() {
  if (!selected.value) return;
  const idx = filtered.value.findIndex(e => e.id === selected.value!.id);
  if (idx > 0) selected.value = filtered.value[idx - 1]!;
}

function handleKey(e: KeyboardEvent) {
  if (!selected.value) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") lightboxNext();
  if (e.key === "ArrowLeft") lightboxPrev();
}

onMounted(() => window.addEventListener("keydown", handleKey));
onUnmounted(() => window.removeEventListener("keydown", handleKey));

watch(selected, (val) => {
  if (val) document.body.style.overflow = "hidden";
  else document.body.style.overflow = "";
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toSnapshot(exp: Experiment): ExperimentSnapshot {
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
  closeLightbox();
  applyExperiment(toSnapshot(exp));
}

function lightboxIdx(): string {
  if (!selected.value) return "";
  const idx = filtered.value.findIndex(e => e.id === selected.value!.id);
  return `${idx + 1} / ${filtered.value.length}`;
}
</script>

<template>
  <div class="flex flex-col h-full bg-base text-primary">

    <!-- ── Header row 1: title + search + sort + refresh ──────────────── -->
    <div class="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex flex-wrap items-center gap-2.5">
      <div class="flex items-center gap-2 mr-1">
        <span class="text-base">🔬</span>
        <span class="font-semibold text-primary text-sm tracking-tight">Experiments</span>
        <span v-if="!loading" class="text-xs bg-elevated text-secondary rounded-full px-2 py-0.5">
          {{ experiments.length }}
        </span>
      </div>

      <div class="flex-1 min-w-[130px] max-w-xs relative">
        <input v-model="search" type="search" placeholder="Search notes, gears…"
          class="w-full bg-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-border-focus transition-colors" />
        <span v-if="search" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-[10px]">{{ filtered.length }}</span>
      </div>

      <button @click="sortDesc = !sortDesc"
        class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-2.5 py-1.5 transition-colors">
        {{ sortDesc ? "↓ Newest" : "↑ Oldest" }}
      </button>

      <button @click="loadExperiments" :disabled="loading"
        class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">
        {{ loading ? "…" : "⟳ Reload" }}
      </button>
    </div>

    <!-- ── Header row 2: target filter tabs with thumbnails ───────────── -->
    <div class="shrink-0 bg-surface border-b-2 border-border overflow-x-auto">
      <div class="flex items-end px-3 gap-0.5 min-w-max">
        <!-- All tab -->
        <button @click="filterTarget = 'all'"
          class="relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
          :class="filterTarget === 'all' ? 'text-accent' : 'text-secondary hover:text-primary'">
          <span class="text-base leading-none">⊞</span>
          All
          <span class="text-[10px] font-normal opacity-60 ml-0.5">{{ experiments.length }}</span>
          <span class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all"
            :class="filterTarget === 'all' ? 'bg-accent' : 'bg-transparent'" />
        </button>

        <!-- Per-target tabs with thumbnail preview -->
        <button v-for="t in allTargets" :key="t.file"
          @click="filterTarget = t.file"
          class="relative flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap group"
          :class="filterTarget === t.file ? 'text-accent' : 'text-secondary hover:text-primary'">
          <!-- Target thumbnail -->
          <div class="w-8 h-8 rounded-md overflow-hidden border-2 shrink-0 transition-all"
            :class="filterTarget === t.file ? 'border-accent shadow-sm' : 'border-border/60 group-hover:border-border-focus'"
            :style="{ background: t.bg }">
            <img :src="`/target/${t.file}`" :alt="t.label"
              class="w-full h-full object-cover"
              :class="filterTarget === t.file ? 'opacity-100' : 'opacity-70 group-hover:opacity-90'" />
          </div>
          <div class="flex flex-col items-start">
            <span>{{ t.label }}</span>
            <span class="text-[9px] font-normal opacity-50 leading-none mt-0.5">
              {{ countByTarget[t.file] ?? 0 }} exp · {{ difficultyStars(t.difficulty) }}
            </span>
          </div>
          <span class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all"
            :class="filterTarget === t.file ? 'bg-accent' : 'bg-transparent'" />
        </button>
      </div>
    </div>

    <!-- ── Active target hero banner ──────────────────────────────────── -->
    <Transition name="slide-down">
      <div v-if="activeTargetInfo" class="shrink-0 border-b border-border bg-surface/60 backdrop-blur-sm">
        <div class="flex items-center gap-4 px-4 py-3">
          <div class="w-16 h-16 rounded-xl overflow-hidden border border-border/60 shrink-0 shadow-sm"
            :style="{ background: activeTargetInfo.bg }">
            <img :src="`/target/${activeTargetInfo.file}`" :alt="activeTargetInfo.label"
              class="w-full h-full object-contain" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-accent uppercase tracking-wider">🎯 Target</span>
              <span class="text-[10px] text-muted">{{ difficultyStars(activeTargetInfo.difficulty) }}</span>
            </div>
            <div class="text-sm font-semibold text-primary mt-0.5">{{ activeTargetInfo.label }}</div>
            <div class="text-xs text-muted mt-0.5">{{ activeTargetInfo.description }}</div>
          </div>
          <div class="ml-auto shrink-0">
            <span class="text-xs text-secondary bg-elevated border border-border rounded-lg px-2.5 py-1.5">
              {{ filtered.length }} experiments
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Content ─────────────────────────────────────────────────────── -->
    <div class="flex-1 min-h-0 overflow-y-auto px-4 py-4">

      <!-- Error state -->
      <div v-if="fetchError" class="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span class="text-3xl">⚠️</span>
        <p class="text-sm text-secondary">Failed to load experiments</p>
        <code class="text-xs text-muted bg-elevated px-3 py-1.5 rounded">{{ fetchError }}</code>
        <button @click="loadExperiments" class="text-xs text-accent hover:underline">Try again</button>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="flex items-center justify-center h-64 text-secondary text-sm">
        Loading experiments…
      </div>

      <!-- Empty for target filter -->
      <div v-else-if="filtered.length === 0 && !search" class="flex flex-col items-center justify-center gap-4 py-16">
        <div v-if="activeTargetInfo" class="w-32 h-32 rounded-2xl overflow-hidden border-2 border-dashed border-border shadow-inner"
          :style="{ background: activeTargetInfo.bg }">
          <img :src="`/target/${activeTargetInfo.file}`" :alt="activeTargetInfo.label"
            class="w-full h-full object-contain opacity-60" />
        </div>
        <p class="text-sm text-secondary text-center">No experiments for this target yet.</p>
        <code class="text-xs text-muted bg-elevated px-3 py-1.5 rounded">pnpm render -- --notes "first attempt"</code>
      </div>
      <!-- Empty search -->
      <div v-else-if="filtered.length === 0" class="flex flex-col items-center justify-center h-64 gap-2 text-secondary text-sm">
        <span class="text-3xl">🔍</span>
        <p>No results for "<span class="text-primary">{{ search }}</span>"</p>
        <button @click="search = ''" class="text-xs text-accent hover:underline">Clear</button>
      </div>

      <!-- Grid -->
      <div v-else class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))">

        <!-- Target reference cards (pinned at top of grid) -->
        <div v-for="t in targetCardsToShow" :key="t.file"
          class="rounded-xl border-2 border-accent/50 overflow-hidden bg-surface flex flex-col animate-fade-in shadow-sm">
          <div class="relative aspect-square overflow-hidden" :style="{ background: t.bg }">
            <img :src="`/target/${t.file}`" :alt="t.label" class="w-full h-full object-contain" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <span class="absolute top-2 left-2 text-[10px] font-bold text-white bg-accent/90 rounded-md px-2 py-1 shadow">🎯 TARGET</span>
            <span class="absolute top-2 right-2 text-[10px] text-white/70 bg-black/40 rounded px-1.5 py-0.5">{{ difficultyStars(t.difficulty) }}</span>
          </div>
          <div class="px-3 py-2.5">
            <div class="text-xs font-semibold text-primary">{{ t.label }}</div>
            <div class="text-[10px] text-muted mt-0.5">{{ t.description }}</div>
            <div class="text-[10px] text-accent/70 mt-1">{{ countByTarget[t.file] ?? 0 }} experiments</div>
          </div>
        </div>

        <!-- Experiment cards -->
        <div v-for="exp in filtered" :key="exp.id" @click="openLightbox(exp)"
          class="rounded-xl border border-border overflow-hidden bg-surface flex flex-col cursor-pointer hover:border-border-focus hover:shadow-lg transition-all duration-200 animate-fade-in group">
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

            <!-- Evolve overlay (center, appears on hover) -->
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto z-10">
              <button @click.stop="evolveInStudio(exp)"
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

            <!-- Target thumbnail (bottom-right corner) -->
            <div class="absolute bottom-2 right-2 group/target">
              <div class="w-11 h-11 rounded-lg overflow-hidden border-2 border-white/40 shadow-lg transition-transform group-hover/target:scale-110"
                :style="{ background: getTargetInfo(exp.target).bg }">
                <img :src="`/target/${exp.target}`" :alt="getTargetInfo(exp.target).label"
                  class="w-full h-full object-cover opacity-80" />
              </div>
              <!-- Tooltip -->
              <div class="absolute bottom-full right-0 mb-1.5 hidden group-hover/target:block z-10 pointer-events-none">
                <div class="bg-black/80 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                  🎯 {{ getTargetInfo(exp.target).label }}
                </div>
              </div>
            </div>
          </div>

          <div class="px-2.5 py-2 flex flex-col gap-1.5 border-t border-border/50">
            <!-- Show target label when viewing all -->
            <div v-if="filterTarget === 'all'" class="flex items-center gap-1.5">
              <div class="w-4 h-4 rounded overflow-hidden border border-border/60 shrink-0"
                :style="{ background: getTargetInfo(exp.target).bg }">
                <img :src="`/target/${exp.target}`" class="w-full h-full object-cover" />
              </div>
              <span class="text-[10px] text-muted truncate">{{ getTargetInfo(exp.target).label }}</span>
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

      </div>
    </div>

    <!-- ── Lightbox ─────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="lightbox">
        <div
          v-if="selected"
          class="fixed inset-0 z-50 flex items-stretch bg-black/90 backdrop-blur-sm"
          @click.self="closeLightbox"
        >
          <!-- Close / nav buttons -->
          <button @click="closeLightbox"
            class="absolute top-4 right-4 z-10 text-white/70 hover:text-white text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
          >×</button>

          <button @click="lightboxPrev"
            :disabled="filtered.findIndex(e => e.id === selected!.id) === 0"
            class="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white text-xl w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition"
          >‹</button>

          <button @click="lightboxNext"
            :disabled="filtered.findIndex(e => e.id === selected!.id) === filtered.length - 1"
            class="absolute right-[21rem] top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white text-xl w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition"
          >›</button>

          <!-- Position counter -->
          <div class="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/50 font-mono">
            {{ lightboxIdx() }}
          </div>

          <!-- Image panel -->
          <div class="flex-1 min-w-0 flex items-center justify-center p-8 lg:p-12">
            <img :src="thumbUrl(selected)" :alt="`Experiment ${selected.id}`"
              class="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          </div>

          <!-- Info panel -->
          <div class="w-72 lg:w-80 shrink-0 bg-surface/95 backdrop-blur border-l border-border overflow-y-auto flex flex-col">
            <!-- Header -->
            <div class="px-5 py-4 border-b border-border">
              <div class="flex items-center justify-between mb-1">
                <span class="font-mono font-bold text-primary text-sm">
                  Exp #{{ String(selected.id).padStart(4, "0") }}
                </span>
                <span class="text-xs text-muted">{{ fmtTime(selected.timestamp) }}</span>
              </div>
              <div class="flex gap-1.5 mt-2">
                <span v-for="color in selected.colors" :key="color"
                  class="w-5 h-5 rounded-full border-2 border-white/20 shadow"
                  :style="{ background: color }" :title="color" />
              </div>
            </div>

            <!-- Evolve CTA -->
            <div class="px-5 py-4 border-b border-border">
              <button @click="evolveInStudio(selected)"
                class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-accent hover:bg-accent/90 active:scale-95 rounded-xl shadow transition-all">
                🚀 Evolve in Studio
              </button>
              <p class="text-[10px] text-muted text-center mt-2">Loads all params into Studio for live tweaking</p>
            </div>

            <!-- Target reference -->
            <div class="px-5 py-3 border-b border-border">
              <div class="text-[10px] uppercase tracking-wider text-muted mb-2">🎯 Target</div>
              <div class="flex items-center gap-3">
                <div class="w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0 shadow-sm"
                  :style="{ background: getTargetInfo(selected.target).bg }">
                  <img :src="`/target/${selected.target}`"
                    :alt="getTargetInfo(selected.target).label"
                    class="w-full h-full object-contain" />
                </div>
                <div>
                  <div class="text-sm font-medium text-primary">{{ getTargetInfo(selected.target).label }}</div>
                  <div class="text-[10px] text-muted mt-0.5">{{ getTargetInfo(selected.target).description }}</div>
                  <div class="text-[10px] text-accent/70 mt-1">{{ difficultyStars(getTargetInfo(selected.target).difficulty) }}</div>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div class="px-5 py-3 border-b border-border">
              <div class="text-[10px] uppercase tracking-wider text-muted mb-1.5">Notes</div>
              <p class="text-sm text-primary leading-relaxed">{{ selected.notes || "—" }}</p>
            </div>

            <!-- Params grid -->
            <div class="px-5 py-3 border-b border-border">
              <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Parameters</div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <ParamRow label="Steps" :value="fmtSteps(selected.steps)" />
                <ParamRow label="Passes" :value="String(selected.passes)" />
                <ParamRow label="Drive" :value="`${selected.driveTeeth}T`" />
                <ParamRow label="Table" :value="selected.tableTeeth ? `${selected.tableTeeth}T` : 'off'" />
                <ParamRow label="Rotation" :value="tableRotationDeg(selected)" />
                <ParamRow label="Speed" :value="String(selected.speed)" />
                <ParamRow label="Line W" :value="String(selected.lineWidth)" />
                <ParamRow label="Canvas" :value="`${selected.width}×${selected.height}`" />
              </div>
            </div>

            <!-- Gear detail -->
            <div class="px-5 py-3 border-b border-border">
              <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Gear Arms</div>
              <div class="space-y-2 text-xs text-secondary font-mono">
                <div><span class="text-muted mr-1">X</span><span class="text-primary">{{ selected.xArmGears || "—" }}</span></div>
                <div><span class="text-muted mr-1">Y</span><span class="text-primary">{{ selected.yArmGears || "—" }}</span></div>
              </div>
            </div>

            <!-- File links -->
            <div class="px-5 py-3">
              <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Files</div>
              <div class="flex flex-col gap-1.5">
                <a v-if="selected.pngFile" :href="`/output/${selected.pngFile}`" target="_blank"
                  class="text-xs text-accent hover:underline">↗ {{ selected.pngFile }}</a>
                <a v-if="selected.svgFile" :href="`/output/${selected.svgFile}`" target="_blank"
                  class="text-xs text-accent hover:underline">↗ {{ selected.svgFile }}</a>
              </div>
            </div>

            <!-- Keyboard hint -->
            <div class="mt-auto px-5 py-3 border-t border-border text-[10px] text-muted flex gap-3">
              <span>← → navigate</span>
              <span>Esc close</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<!-- Inline sub-component for param rows in lightbox -->
<script lang="ts">
import { defineComponent, h } from "vue";
const ParamRow = defineComponent({
  props: { label: String, value: String },
  setup(props) {
    return () => h("div", { class: "contents" }, [
      h("span", { class: "text-muted" }, props.label),
      h("span", { class: "text-primary font-mono" }, props.value),
    ]);
  },
});
export default {};
</script>

<style scoped>
.lightbox-enter-active, .lightbox-leave-active { transition: opacity 0.2s ease; }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.2s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
