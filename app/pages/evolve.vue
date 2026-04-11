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

// ── Mutation config ──────────────────────────────────────────────────────────
//
// Central object defining probability & magnitude for every mutation.
// All probabilities are base values, multiplied by strength (s) where noted.

const MUTATION = reactive({
  // How many of the 5 prop curves to mutate per variant
  curvesPerVariant:    { min: 2, max: 3 },         // pick random in range

  // ── Spine path ──
  spine: {
    addNode:           { prob: 0.35, maxNodes: 12 },    // prob × s
    removeNode:        { prob: 0.25, minNodes: 3 },     // prob × s
    movePosition:      { prob: 0.90, scale: 60 },       // scale = max px × s
    moveHandle:        { prob: 0.85, scale: 45 },       // scale = max px × s
    toggleClosed:      { prob: 0.05 },                   // prob × s
  },

  // ── Property curve nodes ──
  curve: {
    nodeValue:         { prob: 0.80, scale: 0.20 },     // scale = fraction of range × s
    nodeT:             { prob: 0.50, scale: 0.06 },     // scale = max dt × s
    handleDv:          { prob: 0.60, scale: 0.10 },     // scale = fraction of range × s
    handleDt:          { prob: 0.40, scale: 0.06 },     // scale = max dt × s
    addNode:           { prob: 0.15, maxNodes: 8, minGap: 0.08 },  // prob × s
    removeNode:        { prob: 0.10, minNodes: 2 },     // prob × s
    mutateRange:       { prob: 0.08, scale: 0.05 },     // prob × s, scale = fraction of range
  },

  // ── Color ──
  color:               { prob: 0, shift: 30 },       // prob × s, shift = max RGB delta × s

  // ── Orientation rule ──
  // Skip orientation mutation when elliptic ≈ 1 (circle)
  // Per-curve selection probability (0 = never mutate this curve)
  curveProb: {
    radius: 1,
    elliptic: 1,
    orientation: 1,
    frequency: 0,
  },

  // Skip orientation mutation when elliptic ≈ 1 (circle)
  orientationCircularThreshold: 0.05,
});

const PROP_KEYS = ["radius", "elliptic", "orientation", "frequency"] as const;
type SpineNode = ProjectData["paths"][0]["nodes"][0];
type PropCurveData = ProjectData["paths"][0]["spiral"]["radius"];

function mutateProject(source: ProjectData): ProjectData {
  const proj = deepClone(source);
  const s = mutationStrength.value;

  for (const path of proj.paths) {
    mutateSpine(path, s);

    const keys = PROP_KEYS.filter(k => MUTATION.curveProb[k] > 0 && Math.random() < MUTATION.curveProb[k]);
    shuffle(keys);
    const { min, max } = MUTATION.curvesPerVariant;
    const numCurves = min + Math.floor(Math.random() * (max - min + 1));
    for (const key of keys.slice(0, numCurves)) {
      if (key === "orientation" && isCircular(path.spiral.elliptic)) continue;
      mutatePropCurve(path.spiral[key], s);
    }

    if (coin(MUTATION.color.prob * s)) {
      path.color = mutateColor(path.color, s);
    }
  }

  return proj;
}

function isCircular(elliptic: PropCurveData): boolean {
  return elliptic.nodes.every(n => Math.abs(n.value - 1) < MUTATION.orientationCircularThreshold);
}

// ── Spine mutations ──────────────────────────────────────────────────────────

function mutateSpine(path: ProjectData["paths"][0], s: number) {
  const nodes = path.nodes;
  if (nodes.length === 0) return;
  const M = MUTATION.spine;

  const posScale = s * M.movePosition.scale;
  const handleScale = s * M.moveHandle.scale;

  // Add node
  if (nodes.length >= 2 && nodes.length < M.addNode.maxNodes && coin(M.addNode.prob * s)) {
    const idx = Math.floor(Math.random() * (nodes.length - 1));
    const a = nodes[idx]!, b = nodes[idx + 1]!;
    const t = 0.3 + Math.random() * 0.4;
    const mt = 1 - t;
    const ax = a.x + a.handleOut.x, ay = a.y + a.handleOut.y;
    const bx = b.x + b.handleIn.x, by = b.y + b.handleIn.y;
    const mx = mt ** 3 * a.x + 3 * mt ** 2 * t * ax + 3 * mt * t ** 2 * bx + t ** 3 * b.x;
    const my = mt ** 3 * a.y + 3 * mt ** 2 * t * ay + 3 * mt * t ** 2 * by + t ** 3 * b.y;
    const hLen = 30 + Math.random() * 20;
    nodes.splice(idx + 1, 0, {
      id: `evo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: mx + randRange(-posScale * 0.3, posScale * 0.3),
      y: my + randRange(-posScale * 0.3, posScale * 0.3),
      handleIn: { x: -hLen + randRange(-10, 10), y: randRange(-10, 10) },
      handleOut: { x: hLen + randRange(-10, 10), y: randRange(-10, 10) },
    });
  }

  // Remove node
  if (nodes.length > M.removeNode.minNodes && coin(M.removeNode.prob * s)) {
    const idx = 1 + Math.floor(Math.random() * (nodes.length - 2));
    nodes.splice(idx, 1);
  }

  // Move positions
  for (const n of nodes) {
    if (coin(M.movePosition.prob)) {
      n.x += randRange(-posScale, posScale);
      n.y += randRange(-posScale, posScale);
    }
  }

  // Move handles
  for (const n of nodes) {
    if (coin(M.moveHandle.prob)) {
      n.handleIn.x += randRange(-handleScale, handleScale);
      n.handleIn.y += randRange(-handleScale, handleScale);
    }
    if (coin(M.moveHandle.prob)) {
      n.handleOut.x += randRange(-handleScale, handleScale);
      n.handleOut.y += randRange(-handleScale, handleScale);
    }
  }

  // Toggle closed
  if (coin(M.toggleClosed.prob * s)) {
    path.closed = !path.closed;
  }
}

// ── Property curve mutations ─────────────────────────────────────────────────

function mutatePropCurve(curve: PropCurveData, s: number) {
  const M = MUTATION.curve;
  const range = curve.max - curve.min;
  const valueScale = s * range * M.nodeValue.scale;
  const tScale = s * M.nodeT.scale;
  const handleDvScale = s * range * M.handleDv.scale;
  const handleDtScale = s * M.handleDt.scale;

  for (const n of curve.nodes) {
    if (coin(M.nodeValue.prob)) {
      n.value = clamp(n.value + randRange(-valueScale, valueScale), curve.min, curve.max);
    }
    if (n.t > 0.01 && n.t < 0.99 && coin(M.nodeT.prob)) {
      n.t = clamp(n.t + randRange(-tScale, tScale), 0.02, 0.98);
    }
    if (coin(M.handleDv.prob)) {
      n.handleIn.dv += randRange(-handleDvScale, handleDvScale);
      n.handleOut.dv += randRange(-handleDvScale, handleDvScale);
    }
    if (coin(M.handleDt.prob)) {
      n.handleIn.dt += randRange(-handleDtScale, handleDtScale);
      n.handleOut.dt += randRange(-handleDtScale, handleDtScale);
    }
  }

  // Add node
  if (curve.nodes.length < M.addNode.maxNodes && coin(M.addNode.prob * s)) {
    const t = 0.1 + Math.random() * 0.8;
    const nearestDist = Math.min(...curve.nodes.map(n => Math.abs(n.t - t)));
    if (nearestDist > M.addNode.minGap) {
      const sorted = [...curve.nodes].sort((a, b) => a.t - b.t);
      let value = (curve.min + curve.max) / 2;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i]!.t <= t && sorted[i + 1]!.t >= t) {
          const frac = (t - sorted[i]!.t) / (sorted[i + 1]!.t - sorted[i]!.t);
          value = sorted[i]!.value + frac * (sorted[i + 1]!.value - sorted[i]!.value);
          break;
        }
      }
      value = clamp(value + randRange(-valueScale * 0.5, valueScale * 0.5), curve.min, curve.max);
      curve.nodes.push({
        id: `evo_pn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        t, value,
        handleIn: { dt: -0.08 + randRange(-0.03, 0.03), dv: randRange(-handleDvScale * 0.3, handleDvScale * 0.3) },
        handleOut: { dt: 0.08 + randRange(-0.03, 0.03), dv: randRange(-handleDvScale * 0.3, handleDvScale * 0.3) },
      });
      curve.nodes.sort((a, b) => a.t - b.t);
    }
  }

  // Remove node
  if (curve.nodes.length > M.removeNode.minNodes && coin(M.removeNode.prob * s)) {
    const idx = 1 + Math.floor(Math.random() * (curve.nodes.length - 2));
    curve.nodes.splice(idx, 1);
  }

  // Mutate range
  if (coin(M.mutateRange.prob * s)) {
    const rangeShift = range * M.mutateRange.scale * s;
    curve.min = Math.max(0, curve.min + randRange(-rangeShift, rangeShift));
    curve.max = curve.max + randRange(-rangeShift, rangeShift);
    if (curve.max <= curve.min + 0.01) curve.max = curve.min + 0.01;
  }
}

// ── Color mutation ───────────────────────────────────────────────────────────

function mutateColor(hex: string, s: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const shift = Math.round(s * MUTATION.color.shift);
  const nr = clamp(r + randRange(-shift, shift), 0, 255);
  const ng = clamp(g + randRange(-shift, shift), 0, 255);
  const nb = clamp(b + randRange(-shift, shift), 0, 255);
  return `#${Math.round(nr).toString(16).padStart(2, "0")}${Math.round(ng).toString(16).padStart(2, "0")}${Math.round(nb).toString(16).padStart(2, "0")}`;
}

// ── Utilities ────────────────────────────────────────────────────────────────

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
function coin(probability: number): boolean {
  return Math.random() < probability;
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
  };
  function toCurve(key: keyof typeof defs): PropCurve {
    const src = s[key]; const d = defs[key];
    return { label: d.label, color: d.color, unit: d.unit, min: src.min, max: src.max,
      nodes: src.nodes.map(n => ({ id: n.id, t: n.t, value: n.value, handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut } })),
    };
  }
  return { enabled: s.enabled, lineWidth: s.lineWidth ?? 0.3, radius: toCurve("radius"), elliptic: toCurve("elliptic"),
    orientation: toCurve("orientation"), frequency: toCurve("frequency"), deformation: s.deformation ?? [] };
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
    panX.value -= e.deltaX * 0.3;
    panY.value -= e.deltaY * 0.3;
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
