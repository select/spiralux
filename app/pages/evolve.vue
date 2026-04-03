<script setup lang="ts">
/**
 * Genetic Evolution page — 3×3 grid of spiral variants.
 * Center = current state, surrounding 8 = mutations.
 * Click a variant to make it the new center + regenerate mutations.
 */
import type { ProjectData } from "~/composables/useBezierStore";
import { sampleBezierPath, generateSpiralPoints } from "~/utils/spiral";
import type { BezierSpiralConfig, PropCurve, PropNode } from "~/utils/spiral";
import type { BezierNode, Vec2 } from "~/composables/useBezierStore";

// ── State ────────────────────────────────────────────────────────────────────

const store = useBezierStore();
const center = ref<ProjectData | null>(null);
const variants = ref<(ProjectData | null)[]>(new Array(9).fill(null));
const generation = ref(0);

// ── Mutation strength ────────────────────────────────────────────────────────

const mutationStrength = ref(0.3); // 0..1 slider

// ── Init: load from editor if available ──────────────────────────────────────

onMounted(() => {
  if (store.paths.length > 0 && store.paths.some(p => p.nodes.length >= 2)) {
    center.value = store.exportProject();
    regenerate();
  }
});

// ── Deep clone helper ────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Mutation logic ───────────────────────────────────────────────────────────

const PROP_KEYS = ["radius", "elliptic", "orientation", "frequency", "speed"] as const;

function mutateProject(source: ProjectData): ProjectData {
  const proj = deepClone(source);
  const strength = mutationStrength.value;

  for (const path of proj.paths) {
    // Mutate spine nodes (positions + handles)
    mutateSpine(path.nodes, strength);

    // Pick 2 random property curves to mutate
    const keys = [...PROP_KEYS];
    shuffle(keys);
    const toMutate = keys.slice(0, 2);
    for (const key of toMutate) {
      mutatePropCurve(path.spiral[key], strength);
    }
  }

  return proj;
}

function mutateSpine(nodes: ProjectData["paths"][0]["nodes"], strength: number) {
  if (nodes.length === 0) return;
  const scale = strength * 30; // max px displacement
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
    // Don't move t for first/last nodes
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
    if (i === 4) {
      // Center cell = current state
      newVariants.push(deepClone(center.value));
    } else {
      newVariants.push(mutateProject(center.value));
    }
  }
  variants.value = newVariants;
  generation.value++;
}

// ── Select a variant ─────────────────────────────────────────────────────────

function selectVariant(idx: number) {
  const v = variants.value[idx];
  if (!v) return;
  center.value = deepClone(v);
  regenerate();
}

// ── Apply to editor ──────────────────────────────────────────────────────────

function applyToEditor() {
  if (!center.value) return;
  store.importProject(center.value);
  navigateTo("/");
}

// ── Save / Load ──────────────────────────────────────────────────────────────

function saveState() {
  if (!center.value) return;
  const json = JSON.stringify(center.value, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evolve-gen${generation.value}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadState() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text) as ProjectData;
      center.value = data;
      regenerate();
    } catch { /* ignore */ }
  };
  input.click();
}

function loadFromEditor() {
  if (store.paths.length > 0 && store.paths.some(p => p.nodes.length >= 2)) {
    center.value = store.exportProject();
    regenerate();
  }
}

// ── Mini canvas rendering ────────────────────────────────────────────────────

const canvasRefs = ref<(HTMLCanvasElement | null)[]>([]);

function setCanvasRef(el: any, idx: number) {
  canvasRefs.value[idx] = el as HTMLCanvasElement;
}

watch(variants, () => {
  nextTick(() => renderAll());
}, { deep: true });

function renderAll() {
  for (let i = 0; i < 9; i++) {
    renderCell(i);
  }
}

function renderCell(idx: number) {
  const c = canvasRefs.value[idx];
  const proj = variants.value[idx];
  if (!c || !proj) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Find bounding box of all path nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of proj.paths) {
    for (const n of p.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
  }

  if (!isFinite(minX)) return;

  // Add padding
  const pad = 40;
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const scale = Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh);
  const offX = (rect.width - bw * scale) / 2 - minX * scale;
  const offY = (rect.height - bh * scale) / 2 - minY * scale;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  for (const p of proj.paths) {
    if (p.nodes.length < 2) continue;

    // Draw spine
    ctx.beginPath();
    const nodes = p.nodes;
    ctx.moveTo(nodes[0]!.x, nodes[0]!.y);
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i]!;
      const b = nodes[i + 1]!;
      ctx.bezierCurveTo(
        a.x + a.handleOut.x, a.y + a.handleOut.y,
        b.x + b.handleIn.x, b.y + b.handleIn.y,
        b.x, b.y,
      );
    }
    ctx.strokeStyle = p.color + "40";
    ctx.lineWidth = 2 / scale;
    ctx.stroke();

    // Draw spiral
    if (p.spiral.enabled) {
      const spiralConfig = reconstructSpiralConfig(p.spiral);
      const bezNodes = p.nodes.map(n => ({
        id: n.id, x: n.x, y: n.y,
        handleIn: { ...n.handleIn },
        handleOut: { ...n.handleOut },
      }));
      const pathLen = estimateLen(bezNodes);
      const maxFreq = Math.max(...spiralConfig.frequency.nodes.map(n => n.value), 1);
      const maxSpeed = Math.max(...spiralConfig.speed.nodes.map(n => n.value), 1);
      const numSamples = Math.max(400, Math.min(8000, Math.round(pathLen * maxFreq * maxSpeed * 0.3)));
      const samples = sampleBezierPath(bezNodes, p.closed ?? false, numSamples);
      const pts = generateSpiralPoints(samples, spiralConfig);
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        const alpha = idx === 4 ? "d9" : "aa";
        ctx.strokeStyle = p.color + alpha;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
    }
  }

  ctx.restore();

  // Center cell highlight
  if (idx === 4) {
    ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, rect.width - 2, rect.height - 2);
  }
}

/** Reconstruct a full BezierSpiralConfig from serialized project data */
function reconstructSpiralConfig(s: ProjectData["paths"][0]["spiral"]): BezierSpiralConfig {
  const defaults = {
    radius: { label: "Radius", color: "#6366f1", unit: "px" },
    elliptic: { label: "Elliptic", color: "#f59e0b", unit: "×" },
    orientation: { label: "Orient", color: "#10b981", unit: "°" },
    frequency: { label: "Freq", color: "#ec4899", unit: "×" },
    speed: { label: "Speed", color: "#06b6d4", unit: "×" },
  };

  function toCurve(key: keyof typeof defaults): PropCurve {
    const src = s[key];
    const d = defaults[key];
    return {
      label: d.label,
      color: d.color,
      unit: d.unit,
      min: src.min,
      max: src.max,
      nodes: src.nodes.map(n => ({
        id: n.id, t: n.t, value: n.value,
        handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut },
      })),
    };
  }

  return {
    enabled: s.enabled,
    radius: toCurve("radius"),
    elliptic: toCurve("elliptic"),
    orientation: toCurve("orientation"),
    frequency: toCurve("frequency"),
    speed: toCurve("speed"),
  };
}

function estimateLen(nodes: { x: number; y: number; handleIn: Vec2; handleOut: Vec2 }[]): number {
  let len = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!, b = nodes[i + 1]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}
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
          type="range"
          min="0.05"
          max="1"
          step="0.05"
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

      <div v-else class="grid grid-cols-3 grid-rows-3 gap-1.5 h-full">
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
