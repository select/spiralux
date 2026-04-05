<script setup lang="ts">
/**
 * PropertyCurveEditor — bezier curve editor for a single spiral property.
 * X axis = 0..1 (position along path), Y axis = property value (min..max).
 *
 * Two modes:
 *   - compact (default): small read-only thumbnail, no interaction
 *   - expanded: large interactive editor with snapping, tools, preset picker
 */
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from "vue";
import type { PropCurve, PropNode } from "~/utils/spiral";
import { propUid } from "~/utils/spiral";

const props = defineProps<{
  curve: PropCurve;
  height?: number;
  expanded?: boolean;
}>();

const emit = defineEmits<{
  (e: "change"): void;
}>();

const { pushUndo, spiralCursorT } = useBezierStore();

// ── Size constants (responsive to mode) ──────────────────────────────────────

const H = computed(() => props.expanded ? 260 : (props.height ?? 56));
const PAD_L = computed(() => props.expanded ? 44 : 6);
const PAD_R = computed(() => props.expanded ? 12 : 4);
const PAD_T = computed(() => props.expanded ? 8 : 4);
const PAD_B = computed(() => props.expanded ? 18 : 14);
const NODE_R = computed(() => props.expanded ? 8 : 5);
const HANDLE_R = computed(() => props.expanded ? 6 : 3);
const HIT_R = computed(() => props.expanded ? 14 : 8);

const SNAP_THRESHOLD = 8; // pixels
const X_CENTER_SNAP = 0.5;

// ── Refs ─────────────────────────────────────────────────────────────────────

const canvasEl = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const selectedNodeIdx = ref<number>(-1);
const snapGuideY = ref<number | null>(null);
const snapGuideX = ref<number | null>(null);

// Preset picker state
const presetSegIdx = ref(-1);

// ── Curve presets ────────────────────────────────────────────────────────────

interface CurvePreset { name: string; p: [number, number, number, number]; }
const PRESETS: CurvePreset[] = [
  { name: "Linear", p: [0, 0, 1, 1] },
  { name: "Ease", p: [0.25, 0.1, 0.25, 1] },
  { name: "Ease-in", p: [0.42, 0, 1, 1] },
  { name: "Ease-out", p: [0, 0, 0.58, 1] },
  { name: "Ease-in-out", p: [0.42, 0, 0.58, 1] },
  { name: "Mat std", p: [0.4, 0, 0.2, 1] },
  { name: "Mat decel", p: [0, 0, 0.2, 1] },
  { name: "Accel", p: [0.4, 0, 1, 1] },
  { name: "InQuint", p: [0.755, 0.05, 0.855, 0.06] },
  { name: "OutQuint", p: [0.23, 1, 0.32, 1] },
  { name: "InOutQuint", p: [0.86, 0, 0.07, 1] },
  { name: "InExpo", p: [0.95, 0.05, 0.795, 0.035] },
  { name: "OutExpo", p: [0.19, 1, 0.22, 1] },
  { name: "InOutExpo", p: [1, 0, 0, 1] },
  { name: "InBack", p: [0.6, -0.28, 0.735, 0.045] },
  { name: "OutBack", p: [0.175, 0.885, 0.32, 1.275] },
  { name: "InOutBack", p: [0.68, -0.55, 0.265, 1.55] },
  { name: "InSine", p: [0.47, 0, 0.745, 0.715] },
  { name: "OutSine", p: [0.39, 0.575, 0.565, 1] },
  { name: "InOutSine", p: [0.445, 0.05, 0.55, 0.95] },
  { name: "InCubic", p: [0.55, 0.055, 0.675, 0.19] },
  { name: "OutCubic", p: [0.215, 0.61, 0.355, 1] },
  { name: "InOutCubic", p: [0.645, 0.045, 0.355, 1] },
];

function presetSvgPath(p: [number, number, number, number]): string {
  const pad = 3, sz = 22 - pad * 2;
  const x0 = pad, y0 = 22 - pad, x3 = 22 - pad, y3 = pad;
  return `M${x0},${y0} C${x0 + p[0] * sz},${y0 - p[1] * sz} ${x0 + p[2] * sz},${y0 - p[3] * sz} ${x3},${y3}`;
}

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

// ── Coordinate transforms ────────────────────────────────────────────────────

function canvasW(): number {
  return canvasEl.value?.getBoundingClientRect().width ?? 300;
}

function graphW(): number { return canvasW() - PAD_L.value - PAD_R.value; }
function graphH(): number { return H.value - PAD_T.value - PAD_B.value; }

function tToX(t: number): number {
  return PAD_L.value + t * graphW();
}

function xToT(x: number): number {
  return Math.max(0, Math.min(1, (x - PAD_L.value) / graphW()));
}

function valToY(v: number): number {
  const range = props.curve.max - props.curve.min;
  if (range === 0) return H.value / 2;
  return PAD_T.value + (1 - (v - props.curve.min) / range) * graphH();
}

function yToVal(y: number): number {
  const range = props.curve.max - props.curve.min;
  const frac = 1 - (y - PAD_T.value) / graphH();
  return props.curve.min + frac * range;
}

// ── Drag state ───────────────────────────────────────────────────────────────

type DragKind = null | { kind: "node"; idx: number } | { kind: "handleIn"; idx: number } | { kind: "handleOut"; idx: number };
let drag: DragKind = null;
let didDrag = false;

// ── Hit testing ──────────────────────────────────────────────────────────────

function hitNode(mx: number, my: number): number {
  const r = HIT_R.value;
  for (let i = props.curve.nodes.length - 1; i >= 0; i--) {
    const n = props.curve.nodes[i]!;
    const dx = tToX(n.t) - mx;
    const dy = valToY(n.value) - my;
    if (dx * dx + dy * dy < r * r) return i;
  }
  return -1;
}

function hitHandle(mx: number, my: number): { idx: number; which: "in" | "out" } | null {
  const r = HIT_R.value;
  const range = props.curve.max - props.curve.min || 1;
  const dtScale = graphW();
  const dvScale = graphH() / range;

  for (let i = props.curve.nodes.length - 1; i >= 0; i--) {
    const n = props.curve.nodes[i]!;
    const nx = tToX(n.t), ny = valToY(n.value);
    const ox = nx + n.handleOut.dt * dtScale;
    const oy = ny - n.handleOut.dv * dvScale;
    if ((ox - mx) ** 2 + (oy - my) ** 2 < r * r) return { idx: i, which: "out" };
    const ix = nx + n.handleIn.dt * dtScale;
    const iy = ny - n.handleIn.dv * dvScale;
    if ((ix - mx) ** 2 + (iy - my) ** 2 < r * r) return { idx: i, which: "in" };
  }
  return null;
}

/** Hit test the drawn curve segments — returns segment index or -1 */
function hitSegment(mx: number, my: number): number {
  const nodes = props.curve.nodes;
  if (nodes.length < 2) return -1;
  const steps = 60;
  const threshold = HIT_R.value;

  for (let seg = 0; seg < nodes.length - 1; seg++) {
    const a = nodes[seg]!;
    const b = nodes[seg + 1]!;
    const p0t = a.t, p1t = a.t + a.handleOut.dt, p2t = b.t + b.handleIn.dt, p3t = b.t;
    const p0v = a.value, p1v = a.value + a.handleOut.dv, p2v = b.value + b.handleIn.dv, p3v = b.value;

    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const mu = 1 - u;
      // Evaluate both t and value as cubic beziers (matches what draw() renders)
      const globalT = mu ** 3 * p0t + 3 * mu ** 2 * u * p1t + 3 * mu * u ** 2 * p2t + u ** 3 * p3t;
      const val = mu ** 3 * p0v + 3 * mu ** 2 * u * p1v + 3 * mu * u ** 2 * p2v + u ** 3 * p3v;
      const px = tToX(globalT);
      const py = valToY(val);
      if ((px - mx) ** 2 + (py - my) ** 2 < threshold * threshold) return seg;
    }
  }
  return -1;
}

function evaluateSegment(segIdx: number, u: number): number {
  const a = props.curve.nodes[segIdx]!;
  const b = props.curve.nodes[segIdx + 1]!;
  const mu = 1 - u;
  const range = props.curve.max - props.curve.min || 1;

  const p0v = a.value;
  const p1v = a.value + a.handleOut.dv;
  const p2v = b.value + b.handleIn.dv;
  const p3v = b.value;
  return mu ** 3 * p0v + 3 * mu ** 2 * u * p1v + 3 * mu * u ** 2 * p2v + u ** 3 * p3v;
}

// ── Node tools ───────────────────────────────────────────────────────────────

function applySharp() {
  const idx = selectedNodeIdx.value;
  if (idx < 0 || idx >= props.curve.nodes.length) return;
  pushUndo();
  const n = props.curve.nodes[idx]!;
  n.handleIn = { dt: 0, dv: 0 };
  n.handleOut = { dt: 0, dv: 0 };
  emit("change");
  draw();
}

function applySmooth() {
  const idx = selectedNodeIdx.value;
  if (idx < 0 || idx >= props.curve.nodes.length) return;
  pushUndo();
  const n = props.curve.nodes[idx]!;
  const prev = props.curve.nodes[idx - 1];
  const next = props.curve.nodes[idx + 1];
  if (!prev && !next) return;

  const pt = prev?.t ?? n.t;
  const pv = prev?.value ?? n.value;
  const nt = next?.t ?? n.t;
  const nv = next?.value ?? n.value;
  const dt = nt - pt;
  const dv = nv - pv;
  const len = Math.sqrt(dt * dt + dv * dv) || 0.001;

  // Preserve current handle lengths, update direction
  const inLen = Math.sqrt(n.handleIn.dt ** 2 + n.handleIn.dv ** 2) || 0.08;
  const outLen = Math.sqrt(n.handleOut.dt ** 2 + n.handleOut.dv ** 2) || 0.08;
  n.handleOut = { dt: (dt / len) * outLen, dv: (dv / len) * outLen };
  n.handleIn = { dt: -(dt / len) * inLen, dv: -(dv / len) * inLen };

  emit("change");
  draw();
}

function applySymmetric() {
  const idx = selectedNodeIdx.value;
  if (idx < 0 || idx >= props.curve.nodes.length) return;
  pushUndo();
  const n = props.curve.nodes[idx]!;
  // Mirror handleIn to match handleOut (same length, opposite direction)
  n.handleIn = { dt: -n.handleOut.dt, dv: -n.handleOut.dv };
  emit("change");
  draw();
}

function applyAutoSmooth() {
  // TODO: implement properly
}

// ── Preset application ───────────────────────────────────────────────────────

function applyPreset(p: [number, number, number, number]) {
  if (presetSegIdx.value < 0) return;
  pushUndo();
  const a = props.curve.nodes[presetSegIdx.value]!;
  const b = props.curve.nodes[presetSegIdx.value + 1]!;
  const dt = b.t - a.t;
  const dv = b.value - a.value;

  // Presets assume low→high (dv > 0). When segment goes high→low,
  // flip the preset vertically so the easing shape is preserved.
  const [x1, y1, x2, y2] = dv >= 0 ? p : [1 - p[2], 1 - p[3], 1 - p[0], 1 - p[1]];

  a.handleOut = { dt: x1 * dt, dv: y1 * dv };
  b.handleIn = { dt: (x2 - 1) * dt, dv: (y2 - 1) * dv };

  presetSegIdx.value = -1;
  emit("change");
  draw();
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw() {
  const c = canvasEl.value;
  if (!c || !ctx) return;
  const w = c.getBoundingClientRect().width;
  const h = H.value;

  ctx.clearRect(0, 0, w, h);

  const curve = props.curve;
  const gW = graphW();
  const gH = graphH();
  const range = curve.max - curve.min || 1;

  // Background
  ctx.fillStyle = props.expanded ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.15)";
  ctx.fillRect(PAD_L.value, PAD_T.value, gW, gH);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 0.5;
  const gridLines = props.expanded ? 6 : 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD_T.value + (i / gridLines) * gH;
    ctx.beginPath();
    ctx.moveTo(PAD_L.value, y);
    ctx.lineTo(w - PAD_R.value, y);
    ctx.stroke();
  }

  // Center guide line (x = 0.5)
  if (props.expanded) {
    const cx = tToX(0.5);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, PAD_T.value);
    ctx.lineTo(cx, PAD_T.value + gH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Y axis labels (expanded only)
  if (props.expanded) {
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(curve.max * 10) / 10), PAD_L.value - 4, PAD_T.value + 10);
    ctx.fillText(String(Math.round(curve.min * 10) / 10), PAD_L.value - 4, h - PAD_B.value);
    const mid = (curve.max + curve.min) / 2;
    ctx.fillText(String(Math.round(mid * 10) / 10), PAD_L.value - 4, PAD_T.value + gH / 2 + 4);
  }

  // Curve label (only in compact mode — expanded has it in the header)
  if (!props.expanded) {
    ctx.textAlign = "left";
    ctx.fillStyle = curve.color;
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.fillText(curve.label, PAD_L.value + 4, PAD_T.value + 10);
  }

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
    ctx.lineWidth = props.expanded ? 2 : 1.5;
    ctx.stroke();
  }

  // Snap guide lines (expanded mode only)
  if (props.expanded) {
    if (snapGuideY.value !== null) {
      const gy = valToY(snapGuideY.value);
      ctx.strokeStyle = "rgba(34, 211, 238, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD_L.value, gy);
      ctx.lineTo(w - PAD_R.value, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (snapGuideX.value !== null) {
      const gx = tToX(snapGuideX.value);
      ctx.strokeStyle = "rgba(34, 211, 238, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(gx, PAD_T.value);
      ctx.lineTo(gx, PAD_T.value + gH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Handles + nodes
  const dtScale = gW;
  const dvScale = gH / range;
  const nodeR = NODE_R.value;
  const handleR = HANDLE_R.value;

  for (let i = 0; i < curve.nodes.length; i++) {
    const n = curve.nodes[i]!;
    const nx = tToX(n.t);
    const ny = valToY(n.value);
    const isSelected = props.expanded && selectedNodeIdx.value === i;

    // Handle lines + dots (expanded, selected node only)
    if (props.expanded && isSelected) {
      const hOutX = nx + n.handleOut.dt * dtScale;
      const hOutY = ny - n.handleOut.dv * dvScale;
      const hInX = nx + n.handleIn.dt * dtScale;
      const hInY = ny - n.handleIn.dv * dvScale;

      ctx.beginPath();
      ctx.moveTo(hInX, hInY);
      ctx.lineTo(nx, ny);
      ctx.lineTo(hOutX, hOutY);
      ctx.strokeStyle = isSelected ? "rgba(34, 211, 238, 0.5)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const [hx, hy] of [[hInX, hInY], [hOutX, hOutY]]) {
        ctx.beginPath();
        ctx.arc(hx!, hy!, handleR, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "rgba(34, 211, 238, 0.8)" : "rgba(255,255,255,0.5)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Node dot
    ctx.beginPath();
    ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#22d3ee" : curve.color;
    ctx.fill();
    ctx.strokeStyle = isSelected ? "rgba(34, 211, 238, 0.6)" : "rgba(0,0,0,0.4)";
    ctx.lineWidth = isSelected ? 2 : (props.expanded ? 1.2 : 0.8);
    ctx.stroke();

    // Value label near selected node in expanded
    if (isSelected && props.expanded) {
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillStyle = "#22d3ee";
      ctx.textAlign = "center";
      const label = `${n.value.toFixed(1)} @ ${(n.t * 100).toFixed(0)}%`;
      ctx.fillText(label, nx, ny - nodeR - 6);
    }
  }
}

/** Simple evaluation for drawing */
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

// ── Events (expanded mode only) ──────────────────────────────────────────────

function getPos(e: MouseEvent) {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onDown(e: MouseEvent) {
  if (!props.expanded) return;
  if (e.button !== 0) return;
  const { x, y } = getPos(e);
  didDrag = false;

  const hh = hitHandle(x, y);
  if (hh) {
    pushUndo();
    drag = { kind: hh.which === "in" ? "handleIn" : "handleOut", idx: hh.idx };
    selectedNodeIdx.value = hh.idx;
    draw();
    return;
  }

  const ni = hitNode(x, y);
  if (ni >= 0) {
    pushUndo();
    drag = { kind: "node", idx: ni };
    selectedNodeIdx.value = ni;
    draw();
    return;
  }

  // Hit test curve segments → show preset picker
  const seg = hitSegment(x, y);
  if (seg >= 0) {
    presetSegIdx.value = seg;
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
  let insertIdx = props.curve.nodes.length;
  for (let i = 0; i < props.curve.nodes.length; i++) {
    if (props.curve.nodes[i]!.t > t) { insertIdx = i; break; }
  }
  props.curve.nodes.splice(insertIdx, 0, newNode);
  drag = { kind: "node", idx: insertIdx };
  selectedNodeIdx.value = insertIdx;
  emit("change");
  draw();
}

function onMove(e: MouseEvent) {
  if (!props.expanded || !canvasEl.value) return;
  const rect = canvasEl.value.getBoundingClientRect();
  const isOver = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

  if (!drag) {
    if (!isOver) return;
    const { x, y } = getPos(e);
    const el = canvasEl.value;
    if (!el) return;
    if (hitHandle(x, y)) el.style.cursor = "pointer";
    else if (hitNode(x, y) >= 0) el.style.cursor = "grab";
    else if (hitSegment(x, y) >= 0) el.style.cursor = "pointer";
    else el.style.cursor = "crosshair";
    return;
  }

  didDrag = true;
  const { x, y } = getPos(e);
  const curve = props.curve;
  const range = curve.max - curve.min || 1;
  const gW = graphW();
  const gH = graphH();

  snapGuideY.value = null;
  snapGuideX.value = null;

  if (drag.kind === "node") {
    const n = curve.nodes[drag.idx]!;
    const isFirst = drag.idx === 0;
    const isLast = drag.idx === curve.nodes.length - 1;
    const minT = isFirst ? 0 : (curve.nodes[drag.idx - 1]?.t ?? 0) + 0.001;
    const maxT = isLast ? 1 : (curve.nodes[drag.idx + 1]?.t ?? 1) - 0.001;

    let newT = isFirst ? 0 : isLast ? 1 : Math.max(minT, Math.min(maxT, xToT(x)));
    let newVal = Math.max(curve.min, Math.min(curve.max, yToVal(y)));

    // X snap to center (0.5)
    if (!isFirst && !isLast) {
      const centerPx = tToX(X_CENTER_SNAP);
      if (Math.abs(x - centerPx) < SNAP_THRESHOLD) {
        newT = X_CENTER_SNAP;
        snapGuideX.value = X_CENTER_SNAP;
      }
    }

    // Y snap to other nodes' values
    for (let i = 0; i < curve.nodes.length; i++) {
      if (i === drag.idx) continue;
      const otherY = valToY(curve.nodes[i]!.value);
      if (Math.abs(y - otherY) < SNAP_THRESHOLD) {
        newVal = curve.nodes[i]!.value;
        snapGuideY.value = newVal;
        break;
      }
    }

    n.t = newT;
    n.value = newVal;
  } else {
    const n = curve.nodes[drag.idx]!;
    const nx = tToX(n.t);
    const ny = valToY(n.value);
    let dt = (x - nx) / gW;
    let dv = -(y - ny) / (gH / range);

    // Snap handle to 0° (horizontal) when close
    const handlePixelY = Math.abs(y - ny);
    if (handlePixelY < SNAP_THRESHOLD) {
      dv = 0;
      snapGuideY.value = n.value;
    }

    if (drag.kind === "handleOut") {
      n.handleOut = { dt, dv };
      if (!e.shiftKey) {
        // Symmetric: opposite handle mirrors direction and length
        n.handleIn = { dt: -dt, dv: -dv };
      }
    } else {
      n.handleIn = { dt, dv };
      if (!e.shiftKey) {
        n.handleOut = { dt: -dt, dv: -dv };
      }
    }
  }

  emit("change");
  draw();
}

function onUp() {
  if (!props.expanded) return;
  drag = null;
  snapGuideY.value = null;
  snapGuideX.value = null;
  draw();
}

function onDblClick(e: MouseEvent) {
  if (!props.expanded) return;
  const { x, y } = getPos(e);
  const ni = hitNode(x, y);
  if (ni >= 0 && ni !== 0 && ni !== props.curve.nodes.length - 1) {
    pushUndo();
    props.curve.nodes.splice(ni, 1);
    if (selectedNodeIdx.value === ni) selectedNodeIdx.value = -1;
    else if (selectedNodeIdx.value > ni) selectedNodeIdx.value--;
    emit("change");
    draw();
  }
}

function onContextMenu(e: MouseEvent) {
  if (!props.expanded) return;
  e.preventDefault();
  const { x, y } = getPos(e);
  const ni = hitNode(x, y);
  if (ni >= 0 && ni !== 0 && ni !== props.curve.nodes.length - 1) {
    pushUndo();
    props.curve.nodes.splice(ni, 1);
    if (selectedNodeIdx.value === ni) selectedNodeIdx.value = -1;
    else if (selectedNodeIdx.value > ni) selectedNodeIdx.value--;
    emit("change");
    draw();
  }
}

// ── Canvas setup ─────────────────────────────────────────────────────────────

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
watch(() => props.expanded, () => {
  // Double rAF to ensure DOM has fully laid out the new size
  requestAnimationFrame(() => requestAnimationFrame(fitCanvas));
});

// Sync selected node's t-position into the store so BezierCanvas can show it on the spine
watch(
  () => {
    if (!props.expanded) return null;
    const idx = selectedNodeIdx.value;
    if (idx < 0 || idx >= props.curve.nodes.length) return null;
    return props.curve.nodes[idx]!.t;
  },
  (t) => { spiralCursorT.value = t; },
  { immediate: true },
);

onUnmounted(() => { spiralCursorT.value = null; });

function onKeydown(e: KeyboardEvent) {
  if (!props.expanded) return;
  const idx = selectedNodeIdx.value;
  if (idx < 0 || idx >= props.curve.nodes.length) return;
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;

  e.preventDefault();
  e.stopPropagation(); // prevent BezierCanvas from also moving on this arrow key
  pushUndo();

  const n = props.curve.nodes[idx]!;
  const range = props.curve.max - props.curve.min || 1;
  const isFirst = idx === 0;
  const isLast = idx === props.curve.nodes.length - 1;

  // Step sizes
  const tStep = (e.shiftKey ? 0.05 : 0.005);
  const vStep = (e.shiftKey ? range * 0.1 : range * 0.01);

  if (e.key === 'ArrowLeft' && !isFirst && !isLast) {
    const minT = (props.curve.nodes[idx - 1]?.t ?? 0) + 0.001;
    n.t = Math.max(minT, n.t - tStep);
  } else if (e.key === 'ArrowRight' && !isFirst && !isLast) {
    const maxT = (props.curve.nodes[idx + 1]?.t ?? 1) - 0.001;
    n.t = Math.min(maxT, n.t + tStep);
  } else if (e.key === 'ArrowUp') {
    n.value = Math.min(props.curve.max, n.value + vStep);
  } else if (e.key === 'ArrowDown') {
    n.value = Math.max(props.curve.min, n.value - vStep);
  }

  emit('change');
  draw();
}

onMounted(() => {
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKeydown, { capture: true });
});

onUnmounted(() => {
  window.removeEventListener("resize", fitCanvas);
  window.removeEventListener("mousemove", onMove);
  window.removeEventListener("mouseup", onUp);
  window.removeEventListener("keydown", onKeydown, { capture: true });
});

const hasSelectedNode = computed(() => selectedNodeIdx.value >= 0 && selectedNodeIdx.value < props.curve.nodes.length);
</script>

<template>
  <div class="flex flex-col" :class="expanded ? 'gap-1.5' : 'gap-0.5'">
    <!-- Header row (expanded only — compact has label drawn on canvas) -->
    <div v-if="expanded" class="flex items-center gap-1.5 px-1 py-1">
      <span
        class="font-bold shrink-0"
        :class="expanded ? 'text-xs' : 'text-[10px]'"
        :style="{ color: curve.color }"
      >{{ curve.label }}</span>

      <!-- Node tools (expanded only) -->
      <div v-if="expanded" class="flex items-center gap-0.5 ml-1">
        <button
          class="node-tool"
          :class="{ disabled: !hasSelectedNode }"
          data-tip="Sharp corner"
          @click="applySharp"
        >
          <i class="i-app-node-sharp text-lg" />
        </button>

        <button
          class="node-tool"
          :class="{ disabled: !hasSelectedNode }"
          data-tip="Smooth handles"
          @click="applySmooth"
        >
          <i class="i-app-node-smooth text-lg" />
        </button>

        <button
          class="node-tool"
          :class="{ disabled: !hasSelectedNode }"
          data-tip="Symmetric handles"
          @click="applySymmetric"
        >
          <i class="i-app-node-symmetric text-lg" />
        </button>

        <!-- Divider before presets -->
        <div v-if="presetSegIdx >= 0" class="w-px h-4 bg-border/40 mx-0.5" />

        <!-- Inline preset strip (visible when a segment is clicked) -->
        <div v-if="presetSegIdx >= 0" class="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          <button
            v-for="preset in PRESETS"
            :key="preset.name"
            class="preset-btn shrink-0"
            :title="preset.name"
            @click="applyPreset(preset.p)"
          >
            <svg viewBox="0 0 22 22" width="20" height="20">
              <path :d="presetSvgPath(preset.p)" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
          <button
            class="shrink-0 text-[9px] text-muted hover:text-primary px-1 cursor-pointer"
            @click="presetSegIdx = -1"
          >
            <i class="i-mdi-close text-sm" />
          </button>
        </div>
      </div>

      <!-- Min/Max controls -->
      <div class="flex items-center gap-1 ml-auto">
        <label class="text-[9px] text-muted">min</label>
        <input
          type="number"
          class="no-spin w-14 h-5 text-[10px] text-center bg-elevated/50 border border-border/40 rounded px-1 text-primary"
          :value="curve.min"
          :step="stepSize"
          :disabled="!expanded"
          @change="(e: Event) => setMin(+(e.target as HTMLInputElement).value)"
        />
        <label class="text-[9px] text-muted">max</label>
        <input
          type="number"
          class="no-spin w-14 h-5 text-[10px] text-center bg-elevated/50 border border-border/40 rounded px-1 text-primary"
          :value="curve.max"
          :step="stepSize"
          :disabled="!expanded"
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
      :class="expanded ? 'cursor-crosshair' : 'cursor-pointer'"
      @mousedown="onDown"
      @dblclick="onDblClick"
      @contextmenu="onContextMenu"
    />

  </div>
</template>

<style scoped>
.node-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  color: rgb(var(--text-secondary));
  position: relative;
}
.node-tool:hover {
  color: rgb(var(--text-primary));
  background: rgba(var(--bg-elevated) / 0.6);
}
.node-tool:active {
  transform: scale(0.92);
}
.node-tool.disabled {
  opacity: 0.3;
  pointer-events: none;
}

/* Tooltip */
.node-tool::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgb(var(--bg-elevated));
  color: rgb(var(--text-primary));
  border: 1px solid rgba(var(--border) / 0.6);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 50;
}
.node-tool:hover::after {
  opacity: 1;
}

.preset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(var(--border) / 0.25);
  cursor: pointer;
  transition: all 0.12s;
  background: transparent;
}
.preset-btn:hover {
  border-color: rgba(var(--accent) / 0.6);
  background: rgba(var(--accent) / 0.1);
}
.preset-btn:active {
  transform: scale(0.92);
}

.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
