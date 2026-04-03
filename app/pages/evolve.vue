<script setup lang="ts">
/**
 * Genetic Evolution page — 3×3 grid of spiral variants.
 * Center = current state, surrounding 8 = mutations.
 * Click a variant to make it the new center + regenerate mutations.
 * All panels share synchronized pan/zoom navigation.
 */
import type { ProjectData } from "~/composables/useBezierStore";
import { renderPaths } from "~/composables/useCanvasRenderer";
import type { CanvasView, RenderablePath } from "~/composables/useCanvasRenderer";
import type { BezierSpiralConfig, PropCurve } from "~/utils/spiral";

// ── State ────────────────────────────────────────────────────────────────────

const store = useBezierStore();
const center = ref<ProjectData | null>(null);
const variants = ref<(ProjectData | null)[]>(new Array(9).fill(null));
const generation = ref(0);

// ── Shared navigation (synchronized across all 9 panels) ────────────────────

const panX = ref(0);
const panY = ref(0);
const zoom = ref(1);
let isPanning = false;
let panStartMouse = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };

// ── Mutation strength ────────────────────────────────────────────────────────

const mutationStrength = ref(0.3);

// ── Init ─────────────────────────────────────────────────────────────────────

onMounted(() => {
  if (store.paths.length > 0 && store.paths.some(p => p.nodes.length >= 2)) {
    center.value = store.exportProject();
    regenerate();
    nextTick(() => fitView());
  }
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
});

// ── Deep clone ───────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Auto-fit view to bounding box ────────────────────────────────────────────

function fitView() {
  const proj = center.value;
  if (!proj) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of proj.paths) {
    for (const n of p.nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
    }
  }
  if (!isFinite(minX)) return;

  // Use first canvas cell to measure available size
  const c = canvasRefs.value[0];
  if (!c) return;
  const rect = c.getBoundingClientRect();

  const pad = 60;
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const newZoom = Math.min((rect.width - pad) / bw, (rect.height - pad) / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  zoom.value = newZoom;
  panX.value = rect.width / 2 - cx * newZoom;
  panY.value = rect.height / 2 - cy * newZoom;
  renderAll();
}

// ── Mutation logic ───────────────────────────────────────────────────────────

const PROP_KEYS = ["radius", "elliptic", "orientation", "frequency", "speed"] as const;

function mutateProject(source: ProjectData): ProjectData {
  const proj = deepClone(source);
  const strength = mutationStrength.value;

  for (const path of proj.paths) {
    mutateSpine(path.nodes, strength);
    const keys = [...PROP_KEYS];
    shuffle(keys);
    for (const key of keys.slice(0, 2)) {
      mutatePropCurve(path.spiral[key], strength);
    }
  }
  return proj;
}

function mutateSpine(nodes: ProjectData["paths"][0]["nodes"], strength: number) {
  const scale = strength * 30;
  const handleScale = strength * 15;
  for (const n of nodes) {
    n.x += randRange(-scale, scale);
    n.y += randRange(-scale, scale);
    n.handleIn.x += randRange(-handleScale, handleScale);
    n.handleIn.y += randRange(-handleScale, handleScale);
    n.handleOut.x += randRange(-handleScale, handleScale);
    n.handleOut.y += randRange(-handleScale, handleScale);
  }
}

function mutatePropCurve(
  curve: { nodes: { id: string; t: number; value: number; handleIn: { dt: number; dv: number }; handleOut: { dt: number; dv: number } }[]; min: number; max: number },
  strength: number,
) {
  const range = curve.max - curve.min;
  const scale = strength * range * 0.25;
  const handleScale = strength * 0.08;
  for (const n of curve.nodes) {
    if (n.t > 0.01 && n.t < 0.99) {
      n.t = clamp(n.t + randRange(-0.05 * strength, 0.05 * strength), 0.01, 0.99);
    }
    n.value = clamp(n.value + randRange(-scale, scale), curve.min, curve.max);
    n.handleIn.dv += randRange(-scale * 0.3, scale * 0.3);
    n.handleOut.dv += randRange(-scale * 0.3, scale * 0.3);
    n.handleIn.dt += randRange(-handleScale, handleScale);
    n.handleOut.dt += randRange(-handleScale, handleScale);
  }
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

// ── Regenerate grid ──────────────────────────────────────────────────────────

function regenerate() {
  if (!center.value) return;
  const newVariants: (ProjectData | null)[] = [];
  for (let i = 0; i < 9; i++) {
    newVariants.push(i === 4 ? deepClone(center.value) : mutateProject(center.value));
  }
  variants.value = newVariants;
  generation.value++;
  nextTick(() => renderAll());
}

function selectVariant(idx: number) {
  const v = variants.value[idx];
  if (!v) return;
  center.value = deepClone(v);
  regenerate();
}

function applyToEditor() {
  if (!center.value) return;
  store.importProject(center.value);
  navigateTo("/");
}

// ── Save / Load ──────────────────────────────────────────────────────────────

function saveState() {
  if (!center.value) return;
  const blob = new Blob([JSON.stringify(center.value, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `evolve-gen${generation.value}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadState() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectData;
      center.value = data;
      regenerate();
      nextTick(() => fitView());
    } catch { /* ignore */ }
  };
  input.click();
}

function loadFromEditor() {
  if (store.paths.length > 0 && store.paths.some(p => p.nodes.length >= 2)) {
    center.value = store.exportProject();
    regenerate();
    nextTick(() => fitView());
  }
}

// ── Canvas refs + rendering ──────────────────────────────────────────────────

const canvasRefs = ref<(HTMLCanvasElement | null)[]>([]);

function setCanvasRef(el: any, idx: number) {
  canvasRefs.value[idx] = el as HTMLCanvasElement;
}

/** Convert serialized project spiral to full BezierSpiralConfig */
function reconstructSpiralConfig(s: ProjectData["paths"][0]["spiral"]): BezierSpiralConfig {
  const defs = {
    radius: { label: "Radius", color: "#6366f1", unit: "px" },
    elliptic: { label: "Elliptic", color: "#f59e0b", unit: "×" },
    orientation: { label: "Orient", color: "#10b981", unit: "°" },
    frequency: { label: "Freq", color: "#ec4899", unit: "×" },
    speed: { label: "Speed", color: "#06b6d4", unit: "×" },
  };
  function toCurve(key: keyof typeof defs): PropCurve {
    const src = s[key]; const d = defs[key];
    return { label: d.label, color: d.color, unit: d.unit, min: src.min, max: src.max,
      nodes: src.nodes.map(n => ({ id: n.id, t: n.t, value: n.value, handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut } })),
    };
  }
  return { enabled: s.enabled, radius: toCurve("radius"), elliptic: toCurve("elliptic"),
    orientation: toCurve("orientation"), frequency: toCurve("frequency"), speed: toCurve("speed") };
}

function projectToRenderPaths(proj: ProjectData): RenderablePath[] {
  return proj.paths.map(p => ({
    nodes: p.nodes.map(n => ({ x: n.x, y: n.y, handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut } })),
    closed: p.closed,
    color: p.color,
    visible: p.visible ?? true,
    spiral: reconstructSpiralConfig(p.spiral),
  }));
}

function renderAll() {
  const view: CanvasView = { panX: panX.value, panY: panY.value, zoom: zoom.value };
  for (let i = 0; i < 9; i++) {
    const c = canvasRefs.value[i];
    const proj = variants.value[i];
    if (!c || !proj) continue;
    const rpaths = projectToRenderPaths(proj);
    renderPaths(c, rpaths, proj.activePathIndex, view, {
      showSpines: false,
      blendMode: proj.settings?.blendMode ?? "source-over",
    });
  }
}

// ── Synchronized navigation ──────────────────────────────────────────────────

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(0.05, Math.min(20, zoom.value * factor));
    panX.value = mx - (mx - panX.value) * (newZoom / zoom.value);
    panY.value = my - (my - panY.value) * (newZoom / zoom.value);
    zoom.value = newZoom;
  } else {
    panX.value -= e.deltaX;
    panY.value -= e.deltaY;
  }
  renderAll();
}

function onMouseDown(e: MouseEvent) {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    isPanning = true;
    panStartMouse = { x: e.clientX, y: e.clientY };
    panStartOffset = { x: panX.value, y: panY.value };
  }
}

function onMouseMove(e: MouseEvent) {
  if (!isPanning) return;
  panX.value = panStartOffset.x + (e.clientX - panStartMouse.x);
  panY.value = panStartOffset.y + (e.clientY - panStartMouse.y);
  renderAll();
}

function onMouseUp() {
  isPanning = false;
}

// Re-render on resize
let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  nextTick(() => {
    const el = document.querySelector(".evo-grid");
    if (el) {
      resizeObs = new ResizeObserver(() => renderAll());
      resizeObs.observe(el);
    }
  });
});
onUnmounted(() => resizeObs?.disconnect());
</script>

<template>
  <div class="h-full flex flex-col bg-surface text-primary">
    <!-- Header bar -->
    <div class="shrink-0 flex items-center gap-2 px-10 py-2 border-b border-border/40">
      <span class="text-sm font-bold tracking-wide">
        <i class="i-mdi-dna mr-1" />Genetic Evolution
      </span>
      <span class="text-xs text-muted">Gen {{ generation }}</span>

      <div class="flex items-center gap-1 ml-4">
        <label class="text-[10px] text-muted uppercase">Mutation</label>
        <input
          v-model.number="mutationStrength"
          type="range" min="0.05" max="1" step="0.05"
          class="w-20 h-1 accent-accent cursor-pointer"
        />
        <span class="text-[10px] text-muted w-6">{{ Math.round(mutationStrength * 100) }}%</span>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button class="evo-btn" @click="loadFromEditor">
          <i class="i-mdi-import" /> From Editor
        </button>
        <button class="evo-btn" @click="applyToEditor">
          <i class="i-mdi-export" /> To Editor
        </button>
        <div class="w-px h-4 bg-border/40 mx-1" />
        <button class="evo-btn" @click="saveState">
          <i class="i-mdi-content-save-outline" /> Save
        </button>
        <button class="evo-btn" @click="loadState">
          <i class="i-mdi-folder-open-outline" /> Load
        </button>
        <div class="w-px h-4 bg-border/40 mx-1" />
        <button class="evo-btn" :disabled="!center" @click="regenerate">
          <i class="i-mdi-refresh" /> Regenerate
        </button>
        <button class="evo-btn" @click="fitView">
          <i class="i-mdi-fit-to-screen-outline" /> Fit
        </button>
      </div>
    </div>

    <!-- 3×3 Grid -->
    <div class="flex-1 min-h-0 p-2">
      <div v-if="!center" class="h-full flex items-center justify-center text-muted text-sm">
        <div class="text-center">
          <i class="i-mdi-dna text-4xl mb-2 block opacity-30" />
          <p>No starting point loaded.</p>
          <p class="mt-1">Draw something in the <button class="text-accent underline cursor-pointer" @click="navigateTo('/')">Editor</button> first, then return here.</p>
        </div>
      </div>

      <div
        v-else
        class="evo-grid grid grid-cols-3 grid-rows-3 gap-1.5 h-full"
        @wheel="onWheel"
        @mousedown="onMouseDown"
      >
        <div
          v-for="(v, idx) in variants"
          :key="idx"
          class="evo-cell"
          :class="{ 'evo-cell-center': idx === 4 }"
          @click="selectVariant(idx)"
        >
          <canvas
            :ref="(el) => setCanvasRef(el, idx)"
            class="w-full h-full rounded-lg"
          />
          <span v-if="idx === 4" class="absolute top-1 left-1.5 text-[9px] font-bold text-accent/70 uppercase tracking-wider">Current</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.evo-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid rgba(var(--border) / 0.4);
  background: rgba(var(--bg-elevated) / 0.4);
  color: rgb(var(--text-secondary));
  cursor: pointer;
  transition: all 0.15s;
}
.evo-btn:hover {
  color: rgb(var(--text-primary));
  background: rgba(var(--bg-elevated) / 0.7);
  border-color: rgba(var(--accent) / 0.4);
}
.evo-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}
.evo-cell {
  position: relative;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
}
.evo-cell:hover {
  border-color: rgba(var(--accent) / 0.5);
  background: rgba(0, 0, 0, 0.25);
}
.evo-cell-center {
  border-color: rgba(var(--accent) / 0.3);
  background: rgba(0, 0, 0, 0.2);
}
</style>
