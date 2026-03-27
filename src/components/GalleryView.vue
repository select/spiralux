<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";

// ── Types ────────────────────────────────────────────────────────────────────

interface Experiment {
  id: number;
  timestamp: string;
  steps: number;
  passes: number;
  colors: string[];
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
    steps: parseInt(r.steps!),
    passes: parseInt(r.passes!),
    colors: (r.colors ?? "#333").split(";"),
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
const search = ref("");
const sortDesc = ref(true);
const loading = ref(true);
const fetchError = ref("");
const selected = ref<Experiment | null>(null);
const showTarget = ref(true);

// ── Data loading ──────────────────────────────────────────────────────────────

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

onMounted(loadExperiments);

// ── Filtered / sorted list ────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = [...experiments.value];
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

// Reset scroll when lightbox opens
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

function lightboxIdx(): string {
  if (!selected.value) return "";
  const idx = filtered.value.findIndex(e => e.id === selected.value!.id);
  return `${idx + 1} / ${filtered.value.length}`;
}
</script>

<template>
  <div class="flex flex-col h-full bg-base text-primary">

    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div class="shrink-0 bg-surface border-b border-border px-4 py-3 flex flex-wrap items-center gap-3">

      <div class="flex items-center gap-2 mr-2">
        <span class="text-lg">🔬</span>
        <span class="font-semibold text-primary text-sm tracking-tight">Experiments</span>
        <span v-if="!loading" class="text-xs bg-elevated text-secondary rounded-full px-2 py-0.5">
          {{ experiments.length }}
        </span>
      </div>

      <!-- Search -->
      <div class="flex-1 min-w-[140px] max-w-xs relative">
        <input
          v-model="search"
          type="search"
          placeholder="Search notes, gears…"
          class="w-full bg-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-border-focus transition-colors"
        />
        <span v-if="search" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">
          {{ filtered.length }}
        </span>
      </div>

      <!-- Sort toggle -->
      <button
        @click="sortDesc = !sortDesc"
        class="flex items-center gap-1.5 text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-3 py-1.5 transition-colors"
        :title="sortDesc ? 'Newest first' : 'Oldest first'"
      >
        <span>{{ sortDesc ? "↓" : "↑" }}</span>
        <span>{{ sortDesc ? "Newest" : "Oldest" }}</span>
      </button>

      <!-- Target toggle -->
      <button
        @click="showTarget = !showTarget"
        class="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border transition-colors"
        :class="showTarget
          ? 'bg-accent/15 border-accent/30 text-accent'
          : 'bg-elevated border-border text-secondary hover:text-primary'"
      >
        🎯 Target
      </button>

      <!-- Refresh -->
      <button
        @click="loadExperiments"
        :disabled="loading"
        class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        title="Reload from disk"
      >
        {{ loading ? "…" : "⟳" }}
      </button>
    </div>

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

      <!-- Empty search result -->
      <div v-else-if="filtered.length === 0" class="flex flex-col items-center justify-center h-64 gap-2 text-secondary text-sm">
        <span class="text-3xl">🔍</span>
        <p>No experiments match "<span class="text-primary">{{ search }}</span>"</p>
        <button @click="search = ''" class="text-xs text-accent hover:underline">Clear search</button>
      </div>

      <!-- Grid -->
      <div v-else class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))">

        <!-- Target reference card (pinned) -->
        <div
          v-if="showTarget"
          class="rounded-xl border-2 border-accent/40 overflow-hidden bg-surface flex flex-col animate-fade-in"
        >
          <div class="relative aspect-square bg-canvas overflow-hidden">
            <img src="/target/IMG_6777.jpeg" alt="Target" class="w-full h-full object-contain" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <span class="absolute bottom-2 left-2 text-xs font-bold text-white bg-accent/90 rounded-full px-2 py-0.5">
              🎯 TARGET
            </span>
          </div>
          <div class="px-3 py-2 text-xs text-secondary">
            3 lobes · pink / cyan / orange · dense mesh fill
          </div>
        </div>

        <!-- Experiment cards -->
        <div
          v-for="exp in filtered"
          :key="exp.id"
          @click="openLightbox(exp)"
          class="rounded-xl border border-border overflow-hidden bg-surface flex flex-col cursor-pointer hover:border-border-focus hover:shadow-lg transition-all duration-200 animate-fade-in group"
        >
          <!-- Thumbnail -->
          <div class="relative aspect-square bg-canvas overflow-hidden">
            <img
              v-if="thumbUrl(exp)"
              :src="thumbUrl(exp)"
              :alt="`Experiment ${exp.id}`"
              class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted text-xs">
              No image
            </div>

            <!-- Gradient overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />

            <!-- ID badge -->
            <div class="absolute top-2 left-2 text-xs font-mono font-bold text-white/90 bg-black/50 rounded px-1.5 py-0.5">
              #{{ String(exp.id).padStart(4, "0") }}
            </div>

            <!-- Color swatches -->
            <div class="absolute top-2 right-2 flex gap-1">
              <span
                v-for="color in exp.colors"
                :key="color"
                class="w-3 h-3 rounded-full border border-white/30 shadow"
                :style="{ background: color }"
              />
            </div>

            <!-- Bottom info overlay -->
            <div class="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-4">
              <p class="text-xs text-white/90 line-clamp-2 leading-snug">{{ exp.notes || "—" }}</p>
            </div>
          </div>

          <!-- Card footer -->
          <div class="px-2.5 py-2 flex flex-col gap-1.5 border-t border-border/50">
            <!-- Params row 1 -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="chip">{{ fmtSteps(exp.steps) }} steps</span>
              <span class="chip">{{ exp.passes }}× pass</span>
              <span class="chip">tbl {{ tableRotationDeg(exp) }}</span>
              <span class="chip">lw {{ exp.lineWidth }}</span>
            </div>
            <!-- Gear info -->
            <div class="text-[10px] text-muted leading-relaxed truncate" :title="`X: ${exp.xArmGears}\nY: ${exp.yArmGears}`">
              X: {{ exp.xArmGears }}
            </div>
            <!-- Timestamp -->
            <div class="text-[10px] text-muted">{{ fmtTime(exp.timestamp) }}</div>
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
          <button
            @click="closeLightbox"
            class="absolute top-4 right-4 z-10 text-white/70 hover:text-white text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
          >×</button>

          <button
            @click="lightboxPrev"
            :disabled="filtered.findIndex(e => e.id === selected!.id) === 0"
            class="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white text-xl w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition"
          >‹</button>

          <button
            @click="lightboxNext"
            :disabled="filtered.findIndex(e => e.id === selected!.id) === filtered.length - 1"
            class="absolute right-14 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white text-xl w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition"
          >›</button>

          <!-- Position counter -->
          <div class="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/50 font-mono">
            {{ lightboxIdx() }}
          </div>

          <!-- Image panel -->
          <div class="flex-1 min-w-0 flex items-center justify-center p-8 lg:p-12">
            <img
              :src="thumbUrl(selected)"
              :alt="`Experiment ${selected.id}`"
              class="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
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
              <!-- Color swatches -->
              <div class="flex gap-1.5 mt-2">
                <span
                  v-for="color in selected.colors"
                  :key="color"
                  class="w-5 h-5 rounded-full border-2 border-white/20 shadow"
                  :style="{ background: color }"
                  :title="color"
                />
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
                <div>
                  <span class="text-muted mr-1">X</span>
                  <span class="text-primary">{{ selected.xArmGears || "—" }}</span>
                </div>
                <div>
                  <span class="text-muted mr-1">Y</span>
                  <span class="text-primary">{{ selected.yArmGears || "—" }}</span>
                </div>
              </div>
            </div>

            <!-- File links -->
            <div class="px-5 py-3">
              <div class="text-[10px] uppercase tracking-wider text-muted mb-2">Files</div>
              <div class="flex flex-col gap-1.5">
                <a
                  v-if="selected.pngFile"
                  :href="`/output/${selected.pngFile}`"
                  target="_blank"
                  class="text-xs text-accent hover:underline"
                >
                  ↗ {{ selected.pngFile }}
                </a>
                <a
                  v-if="selected.svgFile"
                  :href="`/output/${selected.svgFile}`"
                  target="_blank"
                  class="text-xs text-accent hover:underline"
                >
                  ↗ {{ selected.svgFile }}
                </a>
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
.chip {
  @apply text-[10px] bg-elevated text-muted rounded px-1.5 py-0.5 border border-border/50;
}
.lightbox-enter-active, .lightbox-leave-active { transition: opacity 0.2s ease; }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }
</style>
