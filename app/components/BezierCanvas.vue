<script setup lang="ts">
/**
 * BezierCanvas — interactive cubic-bezier path editor.
 * Draws ALL paths; only the active path is interactive (handles shown).
 */
import { ref, onMounted, onUnmounted, watch } from "vue";
import type { BezierNode, BezierPath, Vec2 } from "~/composables/useBezierStore";
import { sampleBezierPath, generateSpiralPoints } from "~/utils/spiral";

const {
  paths,
  path: activePath,
  activePathIndex,
  selectedIds,
  hoveredId,
  select,
  toggleSelect,
  deselectAll,
  selectRect,
  addNode,
  insertNodeOnSegment,
  removeSelected,
  moveSelected,
  setActivePath,
  pushUndo,
  undo,
  redo,
  showSpines,
  spiralBlendMode,
} = useBezierStore();

const canvasEl = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_RADIUS = 6;
const HANDLE_RADIUS = 4;
const HIT_TOLERANCE = 10;
const SEGMENT_HIT_SAMPLES = 40;

// ── Pan & zoom state ─────────────────────────────────────────────────────────

const panX = ref(0);
const panY = ref(0);
const zoom = ref(1);
let isPanning = false;
let panStartMouse = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };

function screenToWorld(sx: number, sy: number): Vec2 {
  return {
    x: (sx - panX.value) / zoom.value,
    y: (sy - panY.value) / zoom.value,
  };
}

// ── Drag state ───────────────────────────────────────────────────────────────

type DragTarget =
  | { kind: "node"; id: string }
  | { kind: "handleIn"; id: string }
  | { kind: "handleOut"; id: string }
  | { kind: "boxSelect"; startX: number; startY: number; curX: number; curY: number }
  | null;

let dragTarget: DragTarget = null;
let dragStartPos: Vec2 = { x: 0, y: 0 };
let dragNodeStartPositions: Map<string, { x: number; y: number }> = new Map();
let didDrag = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Active path shortcut (may be null) */
function ap(): BezierPath | null { return activePath.value; }

function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function evalCubic(a: BezierNode, b: BezierNode, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * (a.x + a.handleOut.x) + 3 * mt * t ** 2 * (b.x + b.handleIn.x) + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * (a.y + a.handleOut.y) + 3 * mt * t ** 2 * (b.y + b.handleIn.y) + t ** 3 * b.y,
  };
}

// ── Hit testing (active path only) ───────────────────────────────────────────

function hitTestNode(wx: number, wy: number): string | null {
  const p = ap();
  if (!p) return null;
  for (let i = p.nodes.length - 1; i >= 0; i--) {
    const n = p.nodes[i]!;
    if (dist({ x: wx, y: wy }, { x: n.x, y: n.y }) < HIT_TOLERANCE / zoom.value) return n.id;
  }
  return null;
}

function hitTestHandle(wx: number, wy: number): { id: string; which: "in" | "out" } | null {
  const p = ap();
  if (!p) return null;
  for (let i = p.nodes.length - 1; i >= 0; i--) {
    const n = p.nodes[i]!;
    const hIn = { x: n.x + n.handleIn.x, y: n.y + n.handleIn.y };
    const hOut = { x: n.x + n.handleOut.x, y: n.y + n.handleOut.y };
    if (dist({ x: wx, y: wy }, hOut) < HIT_TOLERANCE / zoom.value) return { id: n.id, which: "out" };
    if (dist({ x: wx, y: wy }, hIn) < HIT_TOLERANCE / zoom.value) return { id: n.id, which: "in" };
  }
  return null;
}

function hitTestSegment(wx: number, wy: number): { segIdx: number; t: number } | null {
  const p = ap();
  if (!p) return null;
  const segCount = p.closed ? p.nodes.length : p.nodes.length - 1;
  let bestDist = HIT_TOLERANCE / zoom.value;
  let bestSeg: { segIdx: number; t: number } | null = null;
  for (let seg = 0; seg < segCount; seg++) {
    const a = p.nodes[seg]!;
    const b = p.nodes[(seg + 1) % p.nodes.length]!;
    for (let s = 0; s <= SEGMENT_HIT_SAMPLES; s++) {
      const t = s / SEGMENT_HIT_SAMPLES;
      const pt = evalCubic(a, b, t);
      const d = dist({ x: wx, y: wy }, pt);
      if (d < bestDist) { bestDist = d; bestSeg = { segIdx: seg, t }; }
    }
  }
  return bestSeg;
}

/** Hit-test inactive paths (just curves, for switching active path on click) */
function hitTestInactivePath(wx: number, wy: number): number | null {
  for (let pi = 0; pi < paths.length; pi++) {
    if (pi === activePathIndex.value) continue;
    const p = paths[pi]!;
    // test nodes
    for (const n of p.nodes) {
      if (dist({ x: wx, y: wy }, { x: n.x, y: n.y }) < HIT_TOLERANCE / zoom.value) return pi;
    }
    // test segments
    const segCount = p.closed ? p.nodes.length : p.nodes.length - 1;
    for (let seg = 0; seg < segCount; seg++) {
      const a = p.nodes[seg]!;
      const b = p.nodes[(seg + 1) % p.nodes.length]!;
      for (let s = 0; s <= SEGMENT_HIT_SAMPLES; s += 4) {
        const t = s / SEGMENT_HIT_SAMPLES;
        const pt = evalCubic(a, b, t);
        if (dist({ x: wx, y: wy }, pt) < HIT_TOLERANCE / zoom.value) return pi;
      }
    }
  }
  return null;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function cssProp(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawPathCurves(p: BezierPath, color: string, lineWidth: number) {
  if (!ctx) return;
  const segCount = p.closed ? p.nodes.length : p.nodes.length - 1;
  for (let seg = 0; seg < segCount; seg++) {
    const a = p.nodes[seg]!;
    const b = p.nodes[(seg + 1) % p.nodes.length]!;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(
      a.x + a.handleOut.x, a.y + a.handleOut.y,
      b.x + b.handleIn.x, b.y + b.handleIn.y,
      b.x, b.y,
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function estimatePathLength(p: BezierPath): number {
  const segCount = p.closed ? p.nodes.length : p.nodes.length - 1;
  if (segCount <= 0) return 0;
  let len = 0;
  const stepsPerSeg = 20;
  for (let seg = 0; seg < segCount; seg++) {
    const a = p.nodes[seg]!;
    const b = p.nodes[(seg + 1) % p.nodes.length]!;
    let px = a.x, py = a.y;
    for (let i = 1; i <= stepsPerSeg; i++) {
      const t = i / stepsPerSeg;
      const mt = 1 - t;
      const x = mt ** 3 * a.x + 3 * mt ** 2 * t * (a.x + a.handleOut.x) + 3 * mt * t ** 2 * (b.x + b.handleIn.x) + t ** 3 * b.x;
      const y = mt ** 3 * a.y + 3 * mt ** 2 * t * (a.y + a.handleOut.y) + 3 * mt * t ** 2 * (b.y + b.handleIn.y) + t ** 3 * b.y;
      len += Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      px = x; py = y;
    }
  }
  return len;
}

function drawPathSpiral(p: BezierPath, alpha: number) {
  if (!ctx || !p.spiral.enabled || p.nodes.length < 2) return;
  const prevComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = spiralBlendMode.value as GlobalCompositeOperation;
  const pathLen = estimatePathLength(p);
  // Scale samples: ~2 samples per pixel of path length, boosted by max frequency
  const maxFreq = Math.max(...p.spiral.frequency.nodes.map(n => n.value), 1);
  const maxSpeed = Math.max(...p.spiral.speed.nodes.map(n => n.value), 1);
  const numSamples = Math.max(600, Math.min(20000, Math.round(pathLen * maxFreq * maxSpeed * 0.5)));
  const samples = sampleBezierPath(p.nodes, p.closed, numSamples);
  const pts = generateSpiralPoints(samples, p.spiral);
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  // Color with alpha
  const hex = p.color;
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, "0");
  ctx.strokeStyle = hex + alphaHex;
  ctx.lineWidth = 1.2 / zoom.value;
  ctx.stroke();
  ctx.globalCompositeOperation = prevComposite;
}

function draw() {
  const c = canvasEl.value;
  if (!c || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  const w = c.width;
  const h = c.height;
  ctx.resetTransform();
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.save();
  ctx.translate(panX.value, panY.value);
  ctx.scale(zoom.value, zoom.value);

  const selectedColor = "#22d3ee";
  const handleColor = "#f59e0b";

  drawGrid(rect.width, rect.height);

  // ── Draw inactive paths ──
  for (let pi = 0; pi < paths.length; pi++) {
    if (pi === activePathIndex.value) continue;
    const p = paths[pi]!;
    if (p.nodes.length === 0 || !p.visible) continue;
    if (showSpines.value) {
      drawPathCurves(p, p.color + "80", 2 / zoom.value);
      for (const n of p.nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 3 / zoom.value, 0, Math.PI * 2);
        ctx.fillStyle = p.color + "60";
        ctx.fill();
      }
    }
    drawPathSpiral(p, 0.4);
  }

  // ── Draw active path ──
  const p = ap();
  if (p && p.nodes.length > 0 && p.visible) {
    if (showSpines.value) drawPathCurves(p, p.color, 2.5 / zoom.value);
    drawPathSpiral(p, 0.85);

    if (showSpines.value) {
    // Handles & nodes
    for (const n of p.nodes) {
      const isSelected = selectedIds.has(n.id);
      const isHovered = hoveredId.value === n.id;

      const hInAbs = { x: n.x + n.handleIn.x, y: n.y + n.handleIn.y };
      const hOutAbs = { x: n.x + n.handleOut.x, y: n.y + n.handleOut.y };

      // Handle lines
      ctx.beginPath();
      ctx.moveTo(hInAbs.x, hInAbs.y);
      ctx.lineTo(n.x, n.y);
      ctx.lineTo(hOutAbs.x, hOutAbs.y);
      ctx.strokeStyle = isSelected ? selectedColor : handleColor;
      ctx.lineWidth = 1 / zoom.value;
      ctx.setLineDash([4 / zoom.value, 3 / zoom.value]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Handle dots
      for (const hp of [hInAbs, hOutAbs]) {
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, HANDLE_RADIUS / zoom.value, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? selectedColor : handleColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 0.5 / zoom.value;
        ctx.stroke();
      }

      // Node dot
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_RADIUS / zoom.value, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? selectedColor : isHovered ? "#a5b4fc" : p.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1 / zoom.value;
      ctx.stroke();
    }
    } // showSpines
  }

  ctx.restore();

  // Box select overlay
  if (dragTarget && dragTarget.kind === "boxSelect") {
    const bx = dragTarget.startX;
    const by = dragTarget.startY;
    const bw = dragTarget.curX - bx;
    const bh = dragTarget.curY - by;
    ctx.fillStyle = `rgba(${cssProp("--accent", "99 102 241")} / 0.08)`;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = `rgba(${cssProp("--accent", "99 102 241")} / 0.4)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
  }
}

function drawGrid(w: number, h: number) {
  if (!ctx) return;
  const gridSize = 50;
  const z = zoom.value;
  const ox = panX.value;
  const oy = panY.value;

  ctx.strokeStyle = `rgba(${cssProp("--text-muted", "120 120 150")} / 0.08)`;
  ctx.lineWidth = 0.5 / z;

  const wStart = -ox / z;
  const hStart = -oy / z;
  const wEnd = (w - ox) / z;
  const hEnd = (h - oy) / z;

  const xMin = Math.floor(wStart / gridSize) * gridSize;
  const xMax = Math.ceil(wEnd / gridSize) * gridSize;
  const yMin = Math.floor(hStart / gridSize) * gridSize;
  const yMax = Math.ceil(hEnd / gridSize) * gridSize;

  ctx.beginPath();
  for (let x = xMin; x <= xMax; x += gridSize) { ctx.moveTo(x, yMin); ctx.lineTo(x, yMax); }
  for (let y = yMin; y <= yMax; y += gridSize) { ctx.moveTo(xMin, y); ctx.lineTo(xMax, y); }
  ctx.stroke();
}

// ── Cursor ───────────────────────────────────────────────────────────────────

function updateCursor(
  nodeHit: string | null,
  handleHit: { id: string; which: "in" | "out" } | null,
) {
  const el = canvasEl.value;
  if (!el) return;
  if (isPanning) { el.style.cursor = "grabbing"; return; }
  if (dragTarget) {
    if (dragTarget.kind === "node") { el.style.cursor = "grabbing"; return; }
    if (dragTarget.kind === "handleIn" || dragTarget.kind === "handleOut") { el.style.cursor = "grabbing"; return; }
    if (dragTarget.kind === "boxSelect") { el.style.cursor = "crosshair"; return; }
  }
  if (handleHit) { el.style.cursor = "pointer"; return; }
  if (nodeHit) { el.style.cursor = "grab"; return; }
  el.style.cursor = "crosshair";
}

// ── Event handlers ───────────────────────────────────────────────────────────

function getCanvasPos(e: MouseEvent): Vec2 {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onPointerDown(e: MouseEvent) {
  if (!canvasEl.value) return;
  const screenPos = getCanvasPos(e);
  const worldPos = screenToWorld(screenPos.x, screenPos.y);
  didDrag = false;

  // Middle mouse / Alt+click for panning
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    isPanning = true;
    panStartMouse = { x: e.clientX, y: e.clientY };
    panStartOffset = { x: panX.value, y: panY.value };
    e.preventDefault();
    return;
  }

  if (e.button !== 0) return;

  // Check handles on active path
  const handleHit = hitTestHandle(worldPos.x, worldPos.y);
  if (handleHit) {
    pushUndo();
    dragTarget = { kind: handleHit.which === "in" ? "handleIn" : "handleOut", id: handleHit.id };
    dragStartPos = worldPos;
    if (!selectedIds.has(handleHit.id)) select(handleHit.id);
    draw();
    return;
  }

  // Check nodes on active path
  const nodeHit = hitTestNode(worldPos.x, worldPos.y);
  if (nodeHit) {
    if (e.shiftKey) {
      toggleSelect(nodeHit);
    } else if (!selectedIds.has(nodeHit)) {
      select(nodeHit);
    }
    dragTarget = { kind: "node", id: nodeHit };
    dragStartPos = worldPos;
    pushUndo();
    dragNodeStartPositions.clear();
    const p = ap();
    if (p) {
      for (const n of p.nodes) {
        if (selectedIds.has(n.id)) {
          dragNodeStartPositions.set(n.id, { x: n.x, y: n.y });
        }
      }
    }
    draw();
    return;
  }

  // Check click on inactive path → switch to it
  const inactiveHit = hitTestInactivePath(worldPos.x, worldPos.y);
  if (inactiveHit !== null) {
    setActivePath(inactiveHit);
    draw();
    return;
  }

  // Empty space — box select; add node only on click (no drag)
  if (!e.shiftKey) deselectAll();
  dragTarget = {
    kind: "boxSelect",
    startX: screenPos.x,
    startY: screenPos.y,
    curX: screenPos.x,
    curY: screenPos.y,
  };
  dragStartPos = worldPos;
  draw();
}

function onPointerMove(e: MouseEvent) {
  if (!canvasEl.value) return;

  if (isPanning) {
    panX.value = panStartOffset.x + (e.clientX - panStartMouse.x);
    panY.value = panStartOffset.y + (e.clientY - panStartMouse.y);
    draw();
    return;
  }

  const screenPos = getCanvasPos(e);
  const worldPos = screenToWorld(screenPos.x, screenPos.y);

  if (dragTarget) {
    didDrag = true;
    const p = ap();

    if (dragTarget.kind === "node" && p) {
      const dx = worldPos.x - dragStartPos.x;
      const dy = worldPos.y - dragStartPos.y;
      for (const n of p.nodes) {
        const startPos = dragNodeStartPositions.get(n.id);
        if (startPos) { n.x = startPos.x + dx; n.y = startPos.y + dy; }
      }
    } else if ((dragTarget.kind === "handleIn" || dragTarget.kind === "handleOut") && p) {
      const dt = dragTarget;
      const node = p.nodes.find((n) => n.id === dt.id);
      if (node) {
        const hx = worldPos.x - node.x;
        const hy = worldPos.y - node.y;
        if (dt.kind === "handleOut") {
          node.handleOut = { x: hx, y: hy };
          if (!e.shiftKey) {
            const len = Math.sqrt(node.handleIn.x ** 2 + node.handleIn.y ** 2);
            const outLen = Math.sqrt(hx * hx + hy * hy) || 1;
            node.handleIn = { x: (-hx / outLen) * len, y: (-hy / outLen) * len };
          }
        } else {
          node.handleIn = { x: hx, y: hy };
          if (!e.shiftKey) {
            const len = Math.sqrt(node.handleOut.x ** 2 + node.handleOut.y ** 2);
            const inLen = Math.sqrt(hx * hx + hy * hy) || 1;
            node.handleOut = { x: (-hx / inLen) * len, y: (-hy / inLen) * len };
          }
        }
      }
    } else if (dragTarget.kind === "boxSelect") {
      dragTarget.curX = screenPos.x;
      dragTarget.curY = screenPos.y;
    }

    draw();
    return;
  }

  // Hover
  const nodeHit = hitTestNode(worldPos.x, worldPos.y);
  const handleHitHover = hitTestHandle(worldPos.x, worldPos.y);
  if (hoveredId.value !== nodeHit) { hoveredId.value = nodeHit; draw(); }
  updateCursor(nodeHit, handleHitHover);
}

function onPointerUp(e: MouseEvent) {
  if (isPanning) { isPanning = false; return; }
  if (e.button !== 0) return;

  const screenPos = getCanvasPos(e);
  const worldPos = screenToWorld(screenPos.x, screenPos.y);

  if (dragTarget?.kind === "boxSelect") {
    if (!didDrag) {
      const n = addNode(worldPos.x, worldPos.y);
      if (n) select(n.id);
    } else {
      const w1 = screenToWorld(dragTarget.startX, dragTarget.startY);
      const w2 = screenToWorld(dragTarget.curX, dragTarget.curY);
      selectRect(w1.x, w1.y, w2.x, w2.y, e.shiftKey);
    }
    dragTarget = null;
    draw();
    return;
  }

  dragTarget = null;
  dragNodeStartPositions.clear();
}

function onDblClick(e: MouseEvent) {
  const screenPos = getCanvasPos(e);
  const worldPos = screenToWorld(screenPos.x, screenPos.y);
  const segHit = hitTestSegment(worldPos.x, worldPos.y);
  if (segHit) {
    const n = insertNodeOnSegment(segHit.segIdx, segHit.t);
    if (n) { deselectAll(); select(n.id); }
    draw();
  }
}

function onWheel(e: WheelEvent) {
  const screenPos = getCanvasPos(e);
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.max(0.1, Math.min(10, zoom.value * factor));
  panX.value = screenPos.x - (screenPos.x - panX.value) * (newZoom / zoom.value);
  panY.value = screenPos.y - (screenPos.y - panY.value) * (newZoom / zoom.value);
  zoom.value = newZoom;
  draw();
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  const nudge = e.shiftKey ? 10 : 1;

  switch (e.key) {
    case "z": case "Z":
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); draw(); }
      break;
    case "y": case "Y":
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo(); draw(); }
      break;
    case "Delete": case "Backspace":
      e.preventDefault(); removeSelected(); draw(); break;
    case "ArrowLeft":
      e.preventDefault(); pushUndo(); moveSelected(-nudge, 0); draw(); break;
    case "ArrowRight":
      e.preventDefault(); pushUndo(); moveSelected(nudge, 0); draw(); break;
    case "ArrowUp":
      e.preventDefault(); pushUndo(); moveSelected(0, -nudge); draw(); break;
    case "ArrowDown":
      e.preventDefault(); pushUndo(); moveSelected(0, nudge); draw(); break;
    case "a": case "A":
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); useBezierStore().selectAll(); draw(); }
      break;
    case "Escape":
      deselectAll(); draw(); break;
    case "h": case "H":
      if (!e.ctrlKey && !e.metaKey) { showSpines.value = !showSpines.value; draw(); }
      break;
  }
}

// ── Canvas setup ─────────────────────────────────────────────────────────────

function fitCanvas() {
  const c = canvasEl.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

// Redraw on any path data change (active or inactive)
watch(paths, () => draw(), { deep: true });
watch(activePathIndex, () => draw());
watch(showSpines, () => draw());
watch(spiralBlendMode, () => draw());

onMounted(() => {
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("keydown", onKeydown);
  const rect = canvasEl.value!.getBoundingClientRect();
  panX.value = rect.width / 2;
  panY.value = rect.height / 2;
  draw();
});

onUnmounted(() => {
  window.removeEventListener("resize", fitCanvas);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <canvas
    ref="canvasEl"
    class="absolute inset-0 w-full h-full cursor-crosshair"
    @mousedown="onPointerDown"
    @mousemove="onPointerMove"
    @mouseup="onPointerUp"
    @dblclick="onDblClick"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  />
</template>
