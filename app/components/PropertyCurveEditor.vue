<script setup lang="ts">
/**
 * PropertyCurveEditor — mini bezier curve editor for a single spiral property.
 * X axis = 0..1 (position along path), Y axis = property value (min..max).
 * Interactions: click to add, drag to move, double-click to remove, handles.
 */
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import type { PropCurve, PropNode } from "~/utils/spiral";
import { propUid } from "~/utils/spiral";

const props = defineProps<{
  curve: PropCurve;
  height?: number;
}>();

const emit = defineEmits<{
  (e: "change"): void;
}>();

const { pushUndo } = useBezierStore();

const stepSize = computed(() => {
  const range = props.curve.max - props.curve.min;
  if (range <= 1) return 0.1;
  if (range <= 10) return 0.5;
  return 1;
});

function setMin(v: number) {
  if (v >= props.curve.max) return;
  pushUndo();
  props.curve.min = v;
  // Clamp existing nodes
  for (const n of props.curve.nodes) {
    if (n.value < v) n.value = v;
  }
  emit("change");
}

function setMax(v: number) {
  if (v <= props.curve.min) return;
  pushUndo();
  props.curve.max = v;
  for (const n of props.curve.nodes) {
    if (n.value > v) n.value = v;
  }
  emit("change");
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const H = computed(() => props.height ?? 100);
const PAD_L = 36; // left padding for labels
const PAD_R = 8;
const PAD_T = 4;
const PAD_B = 14;
const NODE_R = 5;
const HANDLE_R = 3;
const HIT_R = 8;

// ── Coordinate transforms ────────────────────────────────────────────────────

function canvasW(): number {
  return canvasEl.value?.getBoundingClientRect().width ?? 300;
}

function tToX(t: number): number {
  return PAD_L + t * (canvasW() - PAD_L - PAD_R);
}

function xToT(x: number): number {
  return Math.max(0, Math.min(1, (x - PAD_L) / (canvasW() - PAD_L - PAD_R)));
}

function valToY(v: number): number {
  const range = props.curve.max - props.curve.min;
  if (range === 0) return H.value / 2;
  return PAD_T + (1 - (v - props.curve.min) / range) * (H.value - PAD_T - PAD_B);
}

function yToVal(y: number): number {
  const range = props.curve.max - props.curve.min;
  const frac = 1 - (y - PAD_T) / (H.value - PAD_T - PAD_B);
  return props.curve.min + frac * range;
}

// ── Drag state ───────────────────────────────────────────────────────────────

type DragKind = null | { kind: "node"; idx: number } | { kind: "handleIn"; idx: number } | { kind: "handleOut"; idx: number };
let drag: DragKind = null;
let didDrag = false;

// ── Hit testing ──────────────────────────────────────────────────────────────

function hitNode(mx: number, my: number): number {
  for (let i = props.curve.nodes.length - 1; i >= 0; i--) {
    const n = props.curve.nodes[i]!;
    const dx = tToX(n.t) - mx;
    const dy = valToY(n.value) - my;
    if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
  }
  return -1;
}

function hitHandle(mx: number, my: number): { idx: number; which: "in" | "out" } | null {
  for (let i = props.curve.nodes.length - 1; i >= 0; i--) {
    const n = props.curve.nodes[i]!;
    const nx = tToX(n.t), ny = valToY(n.value);
    // Out handle
    const ox = nx + n.handleOut.dt * (canvasW() - PAD_L - PAD_R);
    const oy = ny - n.handleOut.dv * (H.value - PAD_T - PAD_B) / (props.curve.max - props.curve.min || 1);
    if ((ox - mx) ** 2 + (oy - my) ** 2 < HIT_R * HIT_R) return { idx: i, which: "out" };
    // In handle
    const ix = nx + n.handleIn.dt * (canvasW() - PAD_L - PAD_R);
    const iy = ny - n.handleIn.dv * (H.value - PAD_T - PAD_B) / (props.curve.max - props.curve.min || 1);
    if ((ix - mx) ** 2 + (iy - my) ** 2 < HIT_R * HIT_R) return { idx: i, which: "in" };
  }
  return null;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw() {
  const c = canvasEl.value;
  if (!c || !ctx) return;
  const w = c.getBoundingClientRect().width;
  const h = H.value;

  ctx.clearRect(0, 0, w, h);

  const curve = props.curve;
  const graphW = w - PAD_L - PAD_R;
  const graphH = h - PAD_T - PAD_B;
  const range = curve.max - curve.min || 1;

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(PAD_L, PAD_T, graphW, graphH);

  // Grid lines (3 horizontal)
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD_T + (i / 4) * graphH;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(w - PAD_R, y);
    ctx.stroke();
  }

  // Y axis labels
  ctx.font = "9px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.textAlign = "right";
  ctx.fillText(String(Math.round(curve.max * 10) / 10), PAD_L - 4, PAD_T + 8);
  ctx.fillText(String(Math.round(curve.min * 10) / 10), PAD_L - 4, h - PAD_B);

  // Label
  ctx.textAlign = "left";
  ctx.fillStyle = curve.color;
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.fillText(curve.label, PAD_L + 4, PAD_T + 10);

  // Draw curve by sampling
  if (curve.nodes.length >= 2) {
    ctx.beginPath();
    const steps = 200;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const val = evaluateForDraw(t);
      const x = tToX(t);
      const y = valToY(val);
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Handles + nodes
  const dtScale = graphW;
  const dvScale = graphH / range;

  for (let i = 0; i < curve.nodes.length; i++) {
    const n = curve.nodes[i]!;
    const nx = tToX(n.t);
    const ny = valToY(n.value);

    // Handle lines + dots
    const hOutX = nx + n.handleOut.dt * dtScale;
    const hOutY = ny - n.handleOut.dv * dvScale;
    const hInX = nx + n.handleIn.dt * dtScale;
    const hInY = ny - n.handleIn.dv * dvScale;

    ctx.beginPath();
    ctx.moveTo(hInX, hInY);
    ctx.lineTo(nx, ny);
    ctx.lineTo(hOutX, hOutY);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 0.7;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const [hx, hy] of [[hInX, hInY], [hOutX, hOutY]]) {
      ctx.beginPath();
      ctx.arc(hx!, hy!, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fill();
    }

    // Node
    ctx.beginPath();
    ctx.arc(nx, ny, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = curve.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

/** Simple evaluation for drawing (same as spiral.ts evaluatePropCurve) */
function evaluateForDraw(t: number): number {
  const nodes = props.curve.nodes;
  if (nodes.length === 0) return (props.curve.min + props.curve.max) / 2;
  if (nodes.length === 1) return nodes[0]!.value;
  if (t <= nodes[0]!.t) return nodes[0]!.value;
  if (t >= nodes[nodes.length - 1]!.t) return nodes[nodes.length - 1]!.value;

  let segIdx = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    if (t >= nodes[i]!.t && t <= nodes[i + 1]!.t) { segIdx = i; break; }
  }
  const a = nodes[segIdx]!, b = nodes[segIdx + 1]!;
  const p0t = a.t, p1t = a.t + a.handleOut.dt, p2t = b.t + b.handleIn.dt, p3t = b.t;
  const p0v = a.value, p1v = a.value + a.handleOut.dv, p2v = b.value + b.handleIn.dv, p3v = b.value;

  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const mu = 1 - mid;
    const tMid = mu ** 3 * p0t + 3 * mu ** 2 * mid * p1t + 3 * mu * mid ** 2 * p2t + mid ** 3 * p3t;
    if (tMid < t) lo = mid; else hi = mid;
  }
  const u = (lo + hi) / 2;
  const mu = 1 - u;
  return mu ** 3 * p0v + 3 * mu ** 2 * u * p1v + 3 * mu * u ** 2 * p2v + u ** 3 * p3v;
}

// ── Events ───────────────────────────────────────────────────────────────────

function getPos(e: MouseEvent) {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const { x, y } = getPos(e);
  didDrag = false;

  const hh = hitHandle(x, y);
  if (hh) {
    pushUndo();
    drag = { kind: hh.which === "in" ? "handleIn" : "handleOut", idx: hh.idx };
    return;
  }

  const ni = hitNode(x, y);
  if (ni >= 0) {
    pushUndo();
    drag = { kind: "node", idx: ni };
    return;
  }

  // Click on empty → add node
  pushUndo();
  const t = xToT(x);
  const value = Math.max(props.curve.min, Math.min(props.curve.max, yToVal(y)));
  const newNode: PropNode = {
    id: propUid(), t, value,
    handleIn: { dt: -0.08, dv: 0 },
    handleOut: { dt: 0.08, dv: 0 },
  };
  // Insert sorted by t
  let insertIdx = props.curve.nodes.length;
  for (let i = 0; i < props.curve.nodes.length; i++) {
    if (props.curve.nodes[i]!.t > t) { insertIdx = i; break; }
  }
  props.curve.nodes.splice(insertIdx, 0, newNode);
  drag = { kind: "node", idx: insertIdx };
  emit("change");
  draw();
}

function onMove(e: MouseEvent) {
  if (!canvasEl.value) return;
  // Only handle cursor/drag for this specific canvas
  const rect = canvasEl.value.getBoundingClientRect();
  const isOver = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

  if (!drag) {
    if (!isOver) return;
    // Update cursor
    const { x, y } = getPos(e);
    const el = canvasEl.value;
    if (!el) return;
    if (hitHandle(x, y)) el.style.cursor = "pointer";
    else if (hitNode(x, y) >= 0) el.style.cursor = "grab";
    else el.style.cursor = "crosshair";
    return;
  }

  didDrag = true;
  const { x, y } = getPos(e);
  const curve = props.curve;
  const range = curve.max - curve.min || 1;
  const graphW = canvasW() - PAD_L - PAD_R;
  const graphH = H.value - PAD_T - PAD_B;

  if (drag.kind === "node") {
    const n = curve.nodes[drag.idx]!;
    const isFirst = drag.idx === 0;
    const isLast = drag.idx === curve.nodes.length - 1;
    // Clamp t between neighbors (endpoints locked at 0/1)
    const minT = isFirst ? 0 : (curve.nodes[drag.idx - 1]?.t ?? 0) + 0.001;
    const maxT = isLast ? 1 : (curve.nodes[drag.idx + 1]?.t ?? 1) - 0.001;
    n.t = isFirst ? 0 : isLast ? 1 : Math.max(minT, Math.min(maxT, xToT(x)));
    n.value = Math.max(curve.min, Math.min(curve.max, yToVal(y)));
  } else {
    const n = curve.nodes[drag.idx]!;
    const nx = tToX(n.t);
    const ny = valToY(n.value);
    const dt = (x - nx) / graphW;
    const dv = -(y - ny) / (graphH / range);
    if (drag.kind === "handleOut") {
      n.handleOut = { dt, dv };
      // Mirror in
      if (!e.shiftKey) {
        const inLen = Math.sqrt(n.handleIn.dt ** 2 + n.handleIn.dv ** 2);
        const outLen = Math.sqrt(dt ** 2 + dv ** 2) || 0.001;
        n.handleIn = { dt: -dt * inLen / outLen, dv: -dv * inLen / outLen };
      }
    } else {
      n.handleIn = { dt, dv };
      if (!e.shiftKey) {
        const outLen = Math.sqrt(n.handleOut.dt ** 2 + n.handleOut.dv ** 2);
        const inLen = Math.sqrt(dt ** 2 + dv ** 2) || 0.001;
        n.handleOut = { dt: -dt * outLen / inLen, dv: -dv * outLen / inLen };
      }
    }
  }

  emit("change");
  draw();
}

function onUp() {
  drag = null;
}

function onDblClick(e: MouseEvent) {
  const { x, y } = getPos(e);
  const ni = hitNode(x, y);
  if (ni >= 0 && ni !== 0 && ni !== props.curve.nodes.length - 1) {
    pushUndo();
    props.curve.nodes.splice(ni, 1);
    emit("change");
    draw();
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  const { x, y } = getPos(e);
  const ni = hitNode(x, y);
  if (ni >= 0 && ni !== 0 && ni !== props.curve.nodes.length - 1) {
    pushUndo();
    props.curve.nodes.splice(ni, 1);
    emit("change");
    draw();
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

function fitCanvas() {
  const c = canvasEl.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = H.value * dpr;
  ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

watch(() => props.curve, () => draw(), { deep: true });
watch(H, () => nextTick(fitCanvas));

onMounted(() => {
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
});

onUnmounted(() => {
  window.removeEventListener("resize", fitCanvas);
  window.removeEventListener("mousemove", onMove);
  window.removeEventListener("mouseup", onUp);
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <!-- Min/Max controls -->
    <div class="flex items-center gap-1.5 px-1">
      <span class="text-[10px] font-bold" :style="{ color: curve.color }">{{ curve.label }}</span>
      <div class="flex items-center gap-1 ml-auto">
        <label class="text-[9px] text-muted">min</label>
        <input
          type="number"
          class="no-spin w-14 h-5 text-[10px] text-center bg-elevated/50 border border-border/40 rounded px-1 text-primary"
          :value="curve.min"
          :step="stepSize"
          @change="(e: Event) => setMin(+(e.target as HTMLInputElement).value)"
        />
        <label class="text-[9px] text-muted">max</label>
        <input
          type="number"
          class="no-spin w-14 h-5 text-[10px] text-center bg-elevated/50 border border-border/40 rounded px-1 text-primary"
          :value="curve.max"
          :step="stepSize"
          @change="(e: Event) => setMax(+(e.target as HTMLInputElement).value)"
        />
        <span class="text-[9px] text-muted">{{ curve.unit }}</span>
      </div>
    </div>
    <!-- Canvas -->
    <canvas
      ref="canvasEl"
      :style="{ height: H + 'px' }"
      class="w-full rounded-lg"
      @mousedown="onDown"
      @dblclick="onDblClick"
      @contextmenu="onContextMenu"
    />
  </div>
</template>
