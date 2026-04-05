<script setup lang="ts">
/**
 * BezierCanvas — interactive cubic-bezier path editor.
 * Draws ALL paths; only the active path is interactive (handles shown).
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { BezierNode, BezierPath, Vec2 } from "~/composables/useBezierStore";
import { renderPaths, drawPathCurves, drawPathSpiral, estimatePathLength } from "~/composables/useCanvasRenderer";
import type { CanvasView } from "~/composables/useCanvasRenderer";

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
  toolbarDock,
  propsDock,
  templateUrl,
  templateVisible,
  spiralCursorT,
} = useBezierStore();

const canvasEl = ref<HTMLCanvasElement | null>(null);

// ── Template image ───────────────────────────────────────────────────────────

// Loaded HTMLImageElement for the active template (null = none)
const templateImg = ref<HTMLImageElement | null>(null);

watch(templateUrl, (url) => {
  if (!url) { templateImg.value = null; return; }
  const img = new Image();
  img.onload = () => { templateImg.value = img; draw(); };
  img.onerror = () => { templateImg.value = null; };
  img.src = url;
}, { immediate: true });

watch(templateVisible, () => draw());

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

// Coalesce multiple draw() calls per frame into a single rAF render.
let _rafId = 0;
function draw() {
  if (!_rafId) {
    _rafId = requestAnimationFrame(() => {
      _rafId = 0;
      _drawImmediate();
    });
  }
}

/** Force an immediate (synchronous) draw — use sparingly. */
function drawNow() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
  _drawImmediate();
}

function _drawImmediate() {
  const c = canvasEl.value;
  if (!c) return;

  const view: CanvasView = { panX: panX.value, panY: panY.value, zoom: zoom.value };

  renderPaths(c, paths as any, activePathIndex.value, view, {
    showSpines: showSpines.value,
    blendMode: spiralBlendMode.value,
    selectedIds: selectedIds,
    hoveredId: hoveredId.value,
    templateImg: templateVisible.value ? templateImg.value : null,
    spiralCursorT: spiralCursorT.value,
  });

  // Box select overlay (editor-only, drawn after renderPaths)
  if (dragTarget && dragTarget.kind === "boxSelect") {
    const ctx2 = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bx = dragTarget.startX;
    const by = dragTarget.startY;
    const bw = dragTarget.curX - bx;
    const bh = dragTarget.curY - by;
    ctx2.fillStyle = `rgba(${cssProp("--accent", "99 102 241")} / 0.08)`;
    ctx2.fillRect(bx, by, bw, bh);
    ctx2.strokeStyle = `rgba(${cssProp("--accent", "99 102 241")} / 0.4)`;
    ctx2.lineWidth = 1;
    ctx2.setLineDash([4, 3]);
    ctx2.strokeRect(bx, by, bw, bh);
    ctx2.setLineDash([]);
  }
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
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+scroll = zoom (pinch-to-zoom on trackpads)
    e.preventDefault();
    const screenPos = getCanvasPos(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom.value * factor));
    panX.value = screenPos.x - (screenPos.x - panX.value) * (newZoom / zoom.value);
    panY.value = screenPos.y - (screenPos.y - panY.value) * (newZoom / zoom.value);
    zoom.value = newZoom;
  } else {
    // Scroll = pan canvas
    panX.value -= e.deltaX * 0.3;
    panY.value -= e.deltaY * 0.3;
  }
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
  draw();
}

// Redraw on any path data change (active or inactive)
watch(paths, () => draw(), { deep: true });
watch(activePathIndex, () => draw());
watch(showSpines, () => draw());
watch(spiralBlendMode, () => draw());
watch(spiralCursorT, () => draw());

// Re-fit canvas when dock positions change (layout resize)
watch([toolbarDock, propsDock], () => {
  nextTick(() => fitCanvas());
});

let resizeObs: ResizeObserver | null = null;

onMounted(() => {
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("keydown", onKeydown);
  const rect = canvasEl.value!.getBoundingClientRect();
  panX.value = rect.width / 2;
  panY.value = rect.height / 2;
  // Observe container resize (e.g. props panel expand/collapse)
  resizeObs = new ResizeObserver(() => fitCanvas());
  resizeObs.observe(canvasEl.value!.parentElement!);
  draw();
});

onUnmounted(() => {
  window.removeEventListener("resize", fitCanvas);
  window.removeEventListener("keydown", onKeydown);
  resizeObs?.disconnect();
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
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
    @wheel="onWheel"
    @contextmenu.prevent
  />
</template>
