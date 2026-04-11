<script setup lang="ts">
/**
 * DeformationPanel — travel path with deformation points + shape editor.
 *
 * Two modes (controlled by parent):
 *   - compact (!expanded): read-only travel-path thumbnail.
 *     Interaction is handled by parent (click wrapper to expand).
 *   - expanded: full editor — travel path on the left with interactive
 *     deformation points, shape bezier editor on the right.
 */
import type { DeformPoint, DeformShapeNode } from "~/utils/spiral";
import { propUid, makeDeformPoint } from "~/utils/spiral";

const props = defineProps<{ expanded?: boolean }>();

const { path: activePath, pushUndo, spiralCursorT } = useBezierStore();

const deformation = computed(() => activePath.value?.spiral.deformation ?? []);
const config = computed(() => activePath.value?.spiral);

const selectedIdx = ref<number>(-1);
const selectedPoint = computed(() => {
  const idx = selectedIdx.value;
  if (idx < 0 || idx >= deformation.value.length) return null;
  return deformation.value[idx] ?? null;
});

// ── Travel path canvas ───────────────────────────────────────────────────────

const travelEl = ref<HTMLCanvasElement | null>(null);
let travelCtx: CanvasRenderingContext2D | null = null;

// Compact mode: 56px tall (matches prop curve thumbnails)
// Expanded mode: 72px tall with more padding
const TRAVEL_H = computed(() => props.expanded ? 100 : 56);
const TRAVEL_PAD_L = computed(() => PREVIEW_R.value + 4);
const TRAVEL_PAD_R = computed(() => PREVIEW_R.value + 4);
const TRAVEL_PAD_T = computed(() => props.expanded ? 8 : 6);
const TRAVEL_PAD_B = computed(() => props.expanded ? 8 : 12);
const PREVIEW_R = computed(() => props.expanded ? 36 : 14);
const HIT_R = 16;

function travelW(): number { return travelEl.value?.getBoundingClientRect().width ?? 200; }
function travelGraphW(): number { return travelW() - TRAVEL_PAD_L.value - TRAVEL_PAD_R.value; }
function tToTravelX(t: number): number { return TRAVEL_PAD_L.value + t * travelGraphW(); }
function travelXToT(x: number): number { return Math.max(0, Math.min(1, (x - TRAVEL_PAD_L.value) / travelGraphW())); }
const travelCY = computed(() => TRAVEL_H.value / 2);

/** Draw a closed bezier shape on a canvas context at (cx, cy) with given scale */
function traceShape(ctx: CanvasRenderingContext2D, nodes: DeformShapeNode[], cx: number, cy: number, scale: number) {
  if (nodes.length < 2) return;
  ctx.beginPath();
  const f = nodes[0]!;
  ctx.moveTo(cx + f.x * scale, cy + f.y * scale);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % nodes.length]!;
    ctx.bezierCurveTo(
      cx + (a.x + a.handleOut.dx) * scale, cy + (a.y + a.handleOut.dy) * scale,
      cx + (b.x + b.handleIn.dx) * scale, cy + (b.y + b.handleIn.dy) * scale,
      cx + b.x * scale, cy + b.y * scale,
    );
  }
  ctx.closePath();
}

function drawTravel() {
  const c = travelEl.value;
  if (!c || !travelCtx) return;
  const h = TRAVEL_H.value;
  const cy = travelCY.value;
  const padT = TRAVEL_PAD_T.value;
  const padB = TRAVEL_PAD_B.value;
  const prevR = PREVIEW_R.value;
  const w = c.getBoundingClientRect().width;
  const ctx = travelCtx;
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(TRAVEL_PAD_L.value, padT, travelGraphW(), h - padT - padB);

  // Horizontal travel line
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(TRAVEL_PAD_L.value, cy);
  ctx.lineTo(w - TRAVEL_PAD_R.value, cy);
  ctx.stroke();

  // Deformation points with shape previews
  const pts = deformation.value;
  for (let i = 0; i < pts.length; i++) {
    const dp = pts[i]!;
    const px = tToTravelX(dp.t);
    const isSelected = props.expanded && i === selectedIdx.value;

    // Tiny shape preview
    ctx.save();
    traceShape(ctx, dp.nodes, px, cy, prevR * 0.7);
    ctx.strokeStyle = isSelected ? "#22d3ee" : "rgba(168,85,247,0.7)";
    ctx.lineWidth = isSelected ? 1.8 : 1;
    ctx.stroke();
    if (isSelected) {
      ctx.fillStyle = "rgba(34,211,238,0.08)";
      ctx.fill();
    }
    ctx.restore();

    // t label (only in expanded)
    if (props.expanded) {
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillStyle = isSelected ? "#22d3ee" : "rgba(255,255,255,0.35)";
      ctx.textAlign = "center";
      ctx.fillText(`${(dp.t * 100).toFixed(0)}%`, px, h - 2);
    }
  }

  // Label
  ctx.textAlign = "left";
  ctx.fillStyle = "#a855f7";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.fillText("Deform", TRAVEL_PAD_L.value + 4, padT + 10);
}

// Travel drag state
let travelDrag: { idx: number } | null = null;
let travelDidDrag = false;

function hitTravelPoint(mx: number, my: number): number {
  const pts = deformation.value;
  const cy = travelCY.value;
  for (let i = pts.length - 1; i >= 0; i--) {
    const px = tToTravelX(pts[i]!.t);
    if ((px - mx) ** 2 + (cy - my) ** 2 < HIT_R * HIT_R) return i;
  }
  return -1;
}

function getTravelPos(e: MouseEvent) {
  const rect = travelEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onTravelDown(e: MouseEvent) {
  if (e.button !== 0 || !props.expanded) return;
  const { x, y } = getTravelPos(e);
  travelDidDrag = false;

  const hi = hitTravelPoint(x, y);
  if (hi >= 0) {
    selectedIdx.value = hi;
    travelDrag = { idx: hi };
    pushUndo();
    drawTravel();
    return;
  }

  // Click empty → add new deformation point
  if (!config.value) return;
  pushUndo();
  const t = travelXToT(x);
  const newPoint = makeDeformPoint(config.value, t);
  const pts = deformation.value;
  let insertIdx = pts.length;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i]!.t > t) { insertIdx = i; break; }
  }
  pts.splice(insertIdx, 0, newPoint);
  selectedIdx.value = insertIdx;
  drawTravel();
}

function onTravelMove(e: MouseEvent) {
  if (!travelEl.value) return;

  // Cursor feedback when not dragging
  if (!travelDrag) {
    const rect = travelEl.value.getBoundingClientRect();
    const isOver = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (isOver && props.expanded) {
      const { x, y } = getTravelPos(e);
      travelEl.value.style.cursor = hitTravelPoint(x, y) >= 0 ? "pointer" : "crosshair";
    }
    return;
  }

  travelDidDrag = true;
  const { x } = getTravelPos(e);
  const pts = deformation.value;
  const dp = pts[travelDrag.idx]!;
  const minT = travelDrag.idx === 0 ? 0 : (pts[travelDrag.idx - 1]?.t ?? 0) + 0.001;
  const maxT = travelDrag.idx === pts.length - 1 ? 1 : (pts[travelDrag.idx + 1]?.t ?? 1) - 0.001;
  dp.t = Math.max(minT, Math.min(maxT, travelXToT(x)));
  drawTravel();
}

function onTravelUp() {
  travelDrag = null;
  drawTravel();
}

function onTravelDblClick(e: MouseEvent) {
  if (!props.expanded) return;
  const { x, y } = getTravelPos(e);
  const hi = hitTravelPoint(x, y);
  if (hi >= 0 && deformation.value.length > 2) {
    pushUndo();
    deformation.value.splice(hi, 1);
    if (selectedIdx.value === hi) selectedIdx.value = -1;
    else if (selectedIdx.value > hi) selectedIdx.value--;
    drawTravel();
  }
}

function fitTravelCanvas() {
  const c = travelEl.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = TRAVEL_H.value * dpr;
  travelCtx = c.getContext("2d")!;
  travelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTravel();
}

// ── Shape editor canvas ──────────────────────────────────────────────────────

const shapeEl = ref<HTMLCanvasElement | null>(null);
let shapeCtx: CanvasRenderingContext2D | null = null;

const SHAPE_SIZE = 240;
const SHAPE_PAD = 20;
const BASE_SHAPE_SCALE = (SHAPE_SIZE - SHAPE_PAD * 2) / 2.8; // maps ±1.4 to canvas at zoom=1
const SHAPE_CX = SHAPE_SIZE / 2;
const SHAPE_CY = SHAPE_SIZE / 2;
const SHAPE_NODE_R = 7;
const SHAPE_HANDLE_R = 5;
const SHAPE_HIT_R = 12;

const shapeZoom = ref(1);
const shapeScale = computed(() => BASE_SHAPE_SCALE * shapeZoom.value);

const selectedShapeNodeIdx = ref<number>(-1);

function shapeToCanvas(x: number, y: number): { cx: number; cy: number } {
  return { cx: SHAPE_CX + x * shapeScale.value, cy: SHAPE_CY + y * shapeScale.value };
}

function canvasToShape(cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - SHAPE_CX) / shapeScale.value, y: (cy - SHAPE_CY) / shapeScale.value };
}

function onShapeWheel(e: WheelEvent) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  shapeZoom.value = Math.max(0.1, Math.min(10, shapeZoom.value * factor));
  drawShape();
}

function drawShape() {
  const c = shapeEl.value;
  if (!c || !shapeCtx || !selectedPoint.value) return;
  const ctx = shapeCtx;
  const nodes = selectedPoint.value.nodes;

  ctx.clearRect(0, 0, SHAPE_SIZE, SHAPE_SIZE);

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0, 0, SHAPE_SIZE, SHAPE_SIZE);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 0.5;
  for (let i = -2; i <= 2; i++) {
    const gx = SHAPE_CX + i * shapeScale.value * 0.5;
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, SHAPE_SIZE); ctx.stroke();
    const gy = SHAPE_CY + i * shapeScale.value * 0.5;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SHAPE_SIZE, gy); ctx.stroke();
  }

  // Crosshair at center
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(SHAPE_CX, 0); ctx.lineTo(SHAPE_CX, SHAPE_SIZE); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, SHAPE_CY); ctx.lineTo(SHAPE_SIZE, SHAPE_CY); ctx.stroke();
  ctx.setLineDash([]);

  // Reference unit circle (faint)
  ctx.beginPath();
  ctx.arc(SHAPE_CX, SHAPE_CY, shapeScale.value, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw closed shape
  if (nodes.length >= 2) {
    traceShape(ctx, nodes, SHAPE_CX, SHAPE_CY, shapeScale.value);
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(168,85,247,0.06)";
    ctx.fill();
  }

  // Handles + nodes
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const { cx: nx, cy: ny } = shapeToCanvas(n.x, n.y);
    const isSelected = selectedShapeNodeIdx.value === i;

    // Handles (selected node only)
    if (isSelected) {
      const hiX = nx + n.handleIn.dx * shapeScale.value;
      const hiY = ny + n.handleIn.dy * shapeScale.value;
      const hoX = nx + n.handleOut.dx * shapeScale.value;
      const hoY = ny + n.handleOut.dy * shapeScale.value;

      ctx.beginPath();
      ctx.moveTo(hiX, hiY);
      ctx.lineTo(nx, ny);
      ctx.lineTo(hoX, hoY);
      ctx.strokeStyle = "rgba(34,211,238,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const [hx, hy] of [[hiX, hiY], [hoX, hoY]]) {
        ctx.beginPath();
        ctx.arc(hx!, hy!, SHAPE_HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(34,211,238,0.8)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Node dot
    ctx.beginPath();
    ctx.arc(nx, ny, SHAPE_NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#22d3ee" : "#a855f7";
    ctx.fill();
    ctx.strokeStyle = isSelected ? "rgba(34,211,238,0.6)" : "rgba(0,0,0,0.4)";
    ctx.lineWidth = isSelected ? 2 : 1.2;
    ctx.stroke();
  }
}

// Shape editor hit testing
function hitShapeNode(mx: number, my: number): number {
  if (!selectedPoint.value) return -1;
  const nodes = selectedPoint.value.nodes;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { cx, cy } = shapeToCanvas(nodes[i]!.x, nodes[i]!.y);
    if ((cx - mx) ** 2 + (cy - my) ** 2 < SHAPE_HIT_R * SHAPE_HIT_R) return i;
  }
  return -1;
}

function hitShapeHandle(mx: number, my: number): { idx: number; which: "in" | "out" } | null {
  if (!selectedPoint.value) return null;
  const nodes = selectedPoint.value.nodes;
  const selIdx = selectedShapeNodeIdx.value;
  if (selIdx < 0 || selIdx >= nodes.length) return null;

  const n = nodes[selIdx]!;
  const { cx: nx, cy: ny } = shapeToCanvas(n.x, n.y);
  const hoX = nx + n.handleOut.dx * shapeScale.value;
  const hoY = ny + n.handleOut.dy * shapeScale.value;
  if ((hoX - mx) ** 2 + (hoY - my) ** 2 < SHAPE_HIT_R * SHAPE_HIT_R) return { idx: selIdx, which: "out" };
  const hiX = nx + n.handleIn.dx * shapeScale.value;
  const hiY = ny + n.handleIn.dy * shapeScale.value;
  if ((hiX - mx) ** 2 + (hiY - my) ** 2 < SHAPE_HIT_R * SHAPE_HIT_R) return { idx: selIdx, which: "in" };
  return null;
}

/** Hit test the closed bezier segments — returns segment index or -1 */
function hitShapeSegment(mx: number, my: number): number {
  if (!selectedPoint.value) return -1;
  const nodes = selectedPoint.value.nodes;
  if (nodes.length < 2) return -1;
  const steps = 40;

  for (let seg = 0; seg < nodes.length; seg++) {
    const a = nodes[seg]!;
    const b = nodes[(seg + 1) % nodes.length]!;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const mu = 1 - u;
      const sx = mu ** 3 * a.x + 3 * mu ** 2 * u * (a.x + a.handleOut.dx) + 3 * mu * u ** 2 * (b.x + b.handleIn.dx) + u ** 3 * b.x;
      const sy = mu ** 3 * a.y + 3 * mu ** 2 * u * (a.y + a.handleOut.dy) + 3 * mu * u ** 2 * (b.y + b.handleIn.dy) + u ** 3 * b.y;
      const { cx: px, cy: py } = shapeToCanvas(sx, sy);
      if ((px - mx) ** 2 + (py - my) ** 2 < SHAPE_HIT_R * SHAPE_HIT_R) return seg;
    }
  }
  return -1;
}

// Shape editor drag state
type ShapeDrag = null | { kind: "node"; idx: number } | { kind: "handleIn"; idx: number } | { kind: "handleOut"; idx: number };
let shapeDrag: ShapeDrag = null;

function getShapePos(e: MouseEvent) {
  const rect = shapeEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onShapeDown(e: MouseEvent) {
  if (e.button !== 0 || !selectedPoint.value) return;
  const { x, y } = getShapePos(e);

  // Hit handle first (only if a node is selected)
  const hh = hitShapeHandle(x, y);
  if (hh) {
    pushUndo();
    shapeDrag = { kind: hh.which === "in" ? "handleIn" : "handleOut", idx: hh.idx };
    return;
  }

  // Hit node
  const ni = hitShapeNode(x, y);
  if (ni >= 0) {
    pushUndo();
    shapeDrag = { kind: "node", idx: ni };
    selectedShapeNodeIdx.value = ni;
    drawShape();
    return;
  }

  // Hit curve segment → add node
  const seg = hitShapeSegment(x, y);
  if (seg >= 0) {
    pushUndo();
    const nodes = selectedPoint.value.nodes;
    const a = nodes[seg]!;
    const b = nodes[(seg + 1) % nodes.length]!;
    // Find closest u on segment
    const steps = 80;
    let bestU = 0.5, bestDist = Infinity;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const mu = 1 - u;
      const sx = mu ** 3 * a.x + 3 * mu ** 2 * u * (a.x + a.handleOut.dx) + 3 * mu * u ** 2 * (b.x + b.handleIn.dx) + u ** 3 * b.x;
      const sy = mu ** 3 * a.y + 3 * mu ** 2 * u * (a.y + a.handleOut.dy) + 3 * mu * u ** 2 * (b.y + b.handleIn.dy) + u ** 3 * b.y;
      const { cx: px, cy: py } = shapeToCanvas(sx, sy);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestDist) { bestDist = d; bestU = u; }
    }
    // De Casteljau split
    const u = bestU;
    const mu = 1 - u;
    const p0 = { x: a.x, y: a.y };
    const p1 = { x: a.x + a.handleOut.dx, y: a.y + a.handleOut.dy };
    const p2 = { x: b.x + b.handleIn.dx, y: b.y + b.handleIn.dy };
    const p3 = { x: b.x, y: b.y };
    const q0 = { x: mu * p0.x + u * p1.x, y: mu * p0.y + u * p1.y };
    const q1 = { x: mu * p1.x + u * p2.x, y: mu * p1.y + u * p2.y };
    const q2 = { x: mu * p2.x + u * p3.x, y: mu * p2.y + u * p3.y };
    const r0 = { x: mu * q0.x + u * q1.x, y: mu * q0.y + u * q1.y };
    const r1 = { x: mu * q1.x + u * q2.x, y: mu * q1.y + u * q2.y };
    const mid = { x: mu * r0.x + u * r1.x, y: mu * r0.y + u * r1.y };

    // Update existing handles
    a.handleOut = { dx: q0.x - a.x, dy: q0.y - a.y };
    b.handleIn = { dx: q2.x - b.x, dy: q2.y - b.y };

    const newNode: DeformShapeNode = {
      id: propUid(),
      x: mid.x,
      y: mid.y,
      handleIn: { dx: r0.x - mid.x, dy: r0.y - mid.y },
      handleOut: { dx: r1.x - mid.x, dy: r1.y - mid.y },
    };
    const insertIdx = (seg + 1) % nodes.length;
    if (insertIdx === 0) {
      nodes.push(newNode);
      selectedShapeNodeIdx.value = nodes.length - 1;
    } else {
      nodes.splice(insertIdx, 0, newNode);
      selectedShapeNodeIdx.value = insertIdx;
    }
    drawShape();
    drawTravel();
    return;
  }

  // Click empty → deselect
  selectedShapeNodeIdx.value = -1;
  drawShape();
}

function onShapeMove(e: MouseEvent) {
  if (!shapeDrag || !shapeEl.value || !selectedPoint.value) return;
  const { x, y } = getShapePos(e);
  const nodes = selectedPoint.value.nodes;

  if (shapeDrag.kind === "node") {
    const n = nodes[shapeDrag.idx]!;
    const pos = canvasToShape(x, y);
    n.x = pos.x;
    n.y = pos.y;
  } else {
    const n = nodes[shapeDrag.idx]!;
    const { cx: nx, cy: ny } = shapeToCanvas(n.x, n.y);
    const dx = (x - nx) / shapeScale.value;
    const dy = (y - ny) / shapeScale.value;

    if (shapeDrag.kind === "handleOut") {
      n.handleOut = { dx, dy };
      if (!e.shiftKey) {
        n.handleIn = { dx: -dx, dy: -dy };
      }
    } else {
      n.handleIn = { dx, dy };
      if (!e.shiftKey) {
        n.handleOut = { dx: -dx, dy: -dy };
      }
    }
  }
  drawShape();
  drawTravel(); // update preview
}

function onShapeUp() {
  shapeDrag = null;
}

function onShapeDblClick(e: MouseEvent) {
  if (!selectedPoint.value) return;
  const { x, y } = getShapePos(e);
  const ni = hitShapeNode(x, y);
  if (ni >= 0 && selectedPoint.value.nodes.length > 3) {
    pushUndo();
    selectedPoint.value.nodes.splice(ni, 1);
    if (selectedShapeNodeIdx.value === ni) selectedShapeNodeIdx.value = -1;
    else if (selectedShapeNodeIdx.value > ni) selectedShapeNodeIdx.value--;
    drawShape();
    drawTravel();
  }
}

function onShapeContextMenu(e: MouseEvent) {
  e.preventDefault();
  onShapeDblClick(e);
}

function resetShape() {
  if (!selectedPoint.value || !config.value) return;
  pushUndo();
  const newNodes = makeDeformPoint(config.value, selectedPoint.value.t).nodes;
  selectedPoint.value.nodes.splice(0, selectedPoint.value.nodes.length, ...newNodes);
  selectedShapeNodeIdx.value = -1;
  drawShape();
  drawTravel();
}

function fitShapeCanvas() {
  const c = shapeEl.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = SHAPE_SIZE * dpr;
  c.height = SHAPE_SIZE * dpr;
  shapeCtx = c.getContext("2d")!;
  shapeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawShape();
}

// Shape cursor feedback
function onShapeHover(e: MouseEvent) {
  if (shapeDrag || !shapeEl.value) return;
  const { x, y } = getShapePos(e);
  const el = shapeEl.value;
  if (hitShapeHandle(x, y)) el.style.cursor = "pointer";
  else if (hitShapeNode(x, y) >= 0) el.style.cursor = "grab";
  else if (hitShapeSegment(x, y) >= 0) el.style.cursor = "copy";
  else el.style.cursor = "default";
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

watch(deformation, () => { drawTravel(); drawShape(); }, { deep: true });
watch(selectedPoint, () => {
  selectedShapeNodeIdx.value = -1;
  shapeZoom.value = 1;
  nextTick(fitShapeCanvas);
});

// Sync selected deformation point's t into the store so BezierCanvas draws the spine marker
watch(
  () => (props.expanded && selectedPoint.value ? selectedPoint.value.t : null),
  (t) => { spiralCursorT.value = t; },
  { immediate: true },
);

onUnmounted(() => { spiralCursorT.value = null; });
watch(() => props.expanded, (exp) => {
  if (!exp) {
    selectedIdx.value = -1;
    selectedShapeNodeIdx.value = -1;
  }
  nextTick(() => { fitTravelCanvas(); fitShapeCanvas(); });
});

onMounted(() => {
  fitTravelCanvas();
  nextTick(fitShapeCanvas); // canvas always in DOM when expanded
  window.addEventListener("resize", fitTravelCanvas);
  window.addEventListener("resize", fitShapeCanvas);
  window.addEventListener("mousemove", onTravelMove);
  window.addEventListener("mouseup", onTravelUp);
  window.addEventListener("mousemove", onShapeMove);
  window.addEventListener("mouseup", onShapeUp);
});

onUnmounted(() => {
  window.removeEventListener("resize", fitTravelCanvas);
  window.removeEventListener("resize", fitShapeCanvas);
  window.removeEventListener("mousemove", onTravelMove);
  window.removeEventListener("mouseup", onTravelUp);
  window.removeEventListener("mousemove", onShapeMove);
  window.removeEventListener("mouseup", onShapeUp);
});
</script>

<template>
  <!-- COMPACT: just the travel strip, click handled by parent wrapper -->
  <template v-if="!expanded">
    <canvas
      ref="travelEl"
      :style="{ height: TRAVEL_H + 'px' }"
      class="w-full rounded-lg"
    />
  </template>

  <!-- EXPANDED: travel path + shape editor side by side -->
  <template v-else>
    <div class="flex gap-2 items-center">
      <!-- Travel path (left) -->
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <canvas
          ref="travelEl"
          :style="{ height: TRAVEL_H + 'px' }"
          class="w-full rounded-lg cursor-crosshair"
          @mousedown="onTravelDown"
          @dblclick="onTravelDblClick"
        />
        <span class="text-[9px] text-muted px-1">click to add · dbl-click to remove · drag to move</span>
      </div>

      <!-- Shape editor column — always reserves fixed space -->
      <div
        class="shrink-0 flex flex-col gap-1"
        :style="{ width: SHAPE_SIZE + 'px' }"
      >
        <!-- Header: visible only when a point is selected -->
        <div
          class="flex items-center gap-1 px-1 transition-opacity duration-150"
          :style="{ visibility: selectedPoint ? 'visible' : 'hidden' }"
        >
          <span class="text-[10px] font-semibold text-[#a855f7]">
            Shape @ {{ selectedPoint ? (selectedPoint.t * 100).toFixed(0) : '–' }}%
          </span>
          <button
            class="ml-auto flex items-center gap-0.5 text-[9px] text-muted hover:text-primary transition-colors cursor-pointer"
            title="Reset to default shape"
            @click="resetShape"
          >
            <i class="i-mdi-refresh text-sm" /> Reset
          </button>
          <button
            class="flex items-center justify-center w-5 h-5 rounded hover:bg-elevated/60 transition-colors cursor-pointer"
            title="Close editor"
            @click="selectedIdx = -1"
          >
            <i class="i-mdi-close text-sm text-muted hover:text-primary" />
          </button>
        </div>

        <!-- Canvas: always present at fixed size; content drawn only when selected -->
        <canvas
          ref="shapeEl"
          :style="{ width: SHAPE_SIZE + 'px', height: SHAPE_SIZE + 'px' }"
          class="rounded-lg transition-opacity duration-150"
          :class="selectedPoint ? 'opacity-100' : 'opacity-0'"
          @mousedown="onShapeDown"
          @mousemove="onShapeHover"
          @dblclick="onShapeDblClick"
          @contextmenu="onShapeContextMenu"
          @wheel.prevent="onShapeWheel"
        />

        <!-- Help text: visible only when a point is selected -->
        <span
          class="text-[9px] text-muted px-1 transition-opacity duration-150"
          :style="{ visibility: selectedPoint ? 'visible' : 'hidden' }"
        >drag nodes · click curve to add · shift for asymmetric</span>
      </div>
    </div>
  </template>
</template>

<style scoped>
</style>
