<script setup lang="ts">
/**
 * BezierCanvas — interactive cubic-bezier path editor.
 * Draws ALL paths; only the active path is interactive (handles shown).
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { BezierNode, BezierPath, Vec2 } from "~/composables/useBezierStore";
import { renderPaths, drawPathCurves, drawPathSpiral, estimatePathLength } from "~/composables/useCanvasRenderer";
import type { CanvasView } from "~/composables/useCanvasRenderer";
import { setSpiralWorkerCallback, initSpiralBackend } from "~/composables/useSpiralWorker";

const {
  paths,
  path: activePath,
  activePathIndex,
  selectedIds,
  hoveredId,
  select,
  toggleSelect,
  deselectAll,
  selectAll,
  selectRect,
  addNode,
  insertNodeOnSegment,
  removeSelected,
  moveSelected,
  setActivePath,
  pushUndo,
  undo,
  redo,
  spiralBlendMode,
  toolbarDock,
  propsDock,
  templateUrl,
  templateVisible,
  spiralCursorT,
  activeTool,
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

// ── Pan & zoom (unified composable) ──────────────────────────────────────────

const nav = useCanvasNavigation({ scrollZoom: false, panSpeed: 0.3 });
const { panX, panY, zoom } = nav;

function screenToWorld(sx: number, sy: number): Vec2 {
  return nav.screenToLocal(sx, sy);
}

// ── Drag state ───────────────────────────────────────────────────────────────

type HandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type DragTarget =
  | { kind: "node"; id: string }
  | { kind: "handleIn"; id: string }
  | { kind: "handleOut"; id: string }
  | { kind: "boxSelect"; startX: number; startY: number; curX: number; curY: number }
  | { kind: "scaleHandle"; pos: HandlePos; bbox: BBox; startMouse: Vec2 }
  | { kind: "rotateHandle"; pos: HandlePos; bbox: BBox; startAngle: number }
  | null;

let dragTarget: DragTarget = null;
let dragStartPos: Vec2 = { x: 0, y: 0 };
const dragNodeStartPositions: Map<string, { x: number; y: number; hInX: number; hInY: number; hOutX: number; hOutY: number }> = new Map();
let didDrag = false;

// ── Selector tool state ─────────────────────────────────────────────────────

/** Toggle between scale and rotate handles on re-click */
type SelectHandleMode = "scale" | "rotate";
const selectHandleMode = ref<SelectHandleMode>("scale");

interface BBox { minX: number; minY: number; maxX: number; maxY: number }

/** Compute world-space bounding box of the active path's nodes + curve samples */
function getPathBBox(p: BezierPath): BBox | null {
  if (p.nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of p.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  for (let i = 0; i < p.nodes.length - (p.closed ? 0 : 1); i++) {
    const a = p.nodes[i]!;
    const b = p.nodes[(i + 1) % p.nodes.length]!;
    for (let t = 0.25; t <= 0.75; t += 0.25) {
      const pt = evalCubic(a, b, t);
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const pad = 4;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function bboxCenter(bb: BBox): Vec2 {
  return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
}

function bboxHandles(bb: BBox): { pos: HandlePos; x: number; y: number }[] {
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  return [
    { pos: "nw", x: bb.minX, y: bb.minY },
    { pos: "n",  x: cx,      y: bb.minY },
    { pos: "ne", x: bb.maxX, y: bb.minY },
    { pos: "e",  x: bb.maxX, y: cy },
    { pos: "se", x: bb.maxX, y: bb.maxY },
    { pos: "s",  x: cx,      y: bb.maxY },
    { pos: "sw", x: bb.minX, y: bb.maxY },
    { pos: "w",  x: bb.minX, y: cy },
  ];
}

function hitBBoxHandle(sx: number, sy: number, bb: BBox, mode: SelectHandleMode): HandlePos | null {
  const z = zoom.value;
  const corners: HandlePos[] = ["nw", "ne", "se", "sw"];
  const handles = bboxHandles(bb);
  for (const h of handles) {
    if (mode === "rotate" && !corners.includes(h.pos)) continue;
    const hsx = h.x * z + panX.value;
    const hsy = h.y * z + panY.value;
    if ((hsx - sx) ** 2 + (hsy - sy) ** 2 < (HIT_TOLERANCE * 1.4) ** 2) return h.pos;
  }
  return null;
}

const SCALE_CURSORS: Record<HandlePos, string> = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize",
};

function drawSelectionBox(ctx: CanvasRenderingContext2D, bb: BBox, mode: SelectHandleMode) {
  const z = zoom.value;
  const ox = panX.value;
  const oy = panY.value;

  // Dashed rectangle
  ctx.strokeStyle = "rgba(99,102,241,0.6)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(
    bb.minX * z + ox, bb.minY * z + oy,
    (bb.maxX - bb.minX) * z, (bb.maxY - bb.minY) * z,
  );
  ctx.setLineDash([]);

  const handles = bboxHandles(bb);
  const hSize = 4;

  if (mode === "scale") {
    for (const h of handles) {
      const hx = h.x * z + ox;
      const hy = h.y * z + oy;
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(hx - hSize, hy - hSize, hSize * 2, hSize * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - hSize, hy - hSize, hSize * 2, hSize * 2);
    }
  } else {
    // Rotation: curved arrows at corners
    const corners: HandlePos[] = ["nw", "ne", "se", "sw"];
    for (const h of handles) {
      if (!corners.includes(h.pos)) continue;
      const hx = h.x * z + ox;
      const hy = h.y * z + oy;
      const dx = h.pos.includes("e") ? 8 : -8;
      const dy = h.pos.includes("s") ? 8 : -8;
      ctx.beginPath();
      ctx.arc(hx + dx, hy + dy, 6, 0, Math.PI * 1.5);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Arrow tip
      const tipX = hx + dx + Math.cos(Math.PI * 1.5) * 6;
      const tipY = hy + dy + Math.sin(Math.PI * 1.5) * 6;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + 4, tipY - 2);
      ctx.lineTo(tipX + 1, tipY + 3);
      ctx.closePath();
      ctx.fillStyle = "#6366f1";
      ctx.fill();
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Active path shortcut (may be null) */
function ap(): BezierPath | null { return activePath.value; }

/** Snapshot node positions + handles for drag transforms */
function snapshotNodes(p: BezierPath) {
  dragNodeStartPositions.clear();
  for (const n of p.nodes) {
    dragNodeStartPositions.set(n.id, {
      x: n.x, y: n.y,
      hInX: n.handleIn.x, hInY: n.handleIn.y,
      hOutX: n.handleOut.x, hOutY: n.handleOut.y,
    });
  }
}

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

  renderPaths(c, paths as unknown as Parameters<typeof renderPaths>[1], activePathIndex.value, view, {
    showSpines: activeTool.value === 'node',
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

  // Selection box with handles (selector tool)
  if (activeTool.value === "select" && selectedIds.size > 0) {
    const p = ap();
    if (p) {
      const bb = getPathBBox(p);
      if (bb) {
        const ctx2 = c.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawSelectionBox(ctx2, bb, selectHandleMode.value);
      }
    }
  }
}

// ── Cursor ───────────────────────────────────────────────────────────────────

function updateCursor(
  nodeHit: string | null,
  handleHit: { id: string; which: "in" | "out" } | null,
) {
  const el = canvasEl.value;
  if (!el) return;
  if (nav.panning()) { el.style.cursor = "grabbing"; return; }
  if (dragTarget) {
    if (dragTarget.kind === "node") { el.style.cursor = "grabbing"; return; }
    if (dragTarget.kind === "handleIn" || dragTarget.kind === "handleOut") { el.style.cursor = "grabbing"; return; }
    if (dragTarget.kind === "boxSelect") { el.style.cursor = "crosshair"; return; }
    if (dragTarget.kind === "scaleHandle") { el.style.cursor = SCALE_CURSORS[dragTarget.pos]; return; }
    if (dragTarget.kind === "rotateHandle") { el.style.cursor = "grabbing"; return; }
  }
  if (activeTool.value === "select") {
    if (nodeHit || handleHit) { el.style.cursor = "grab"; return; }
    el.style.cursor = "default";
    return;
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
  if (nav.startPanIfNeeded(e)) return;

  if (e.button !== 0) return;

  // ── Select tool: whole-path select, move, scale, rotate ────────────
  if (activeTool.value === "select") {
    const p = ap();
    const bb = p ? getPathBBox(p) : null;

    // 1) Hit-test selection handles first (if path is selected)
    if (p && bb && selectedIds.size > 0) {
      const handleHit = hitBBoxHandle(screenPos.x, screenPos.y, bb, selectHandleMode.value);
      if (handleHit) {
        pushUndo();
        snapshotNodes(p);
        if (selectHandleMode.value === "scale") {
          dragTarget = { kind: "scaleHandle", pos: handleHit, bbox: { ...bb }, startMouse: worldPos };
        } else {
          const center = bboxCenter(bb);
          const startAngle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
          dragTarget = { kind: "rotateHandle", pos: handleHit, bbox: { ...bb }, startAngle };
        }
        dragStartPos = worldPos;
        draw();
        return;
      }
    }

    // 2) Hit active path → toggle handle mode on re-click, or drag to move
    const nodeHit = hitTestNode(worldPos.x, worldPos.y);
    const segHit = hitTestSegment(worldPos.x, worldPos.y);
    const inactiveHit = hitTestInactivePath(worldPos.x, worldPos.y);

    if (nodeHit || segHit) {
      if (p && selectedIds.size > 0) {
        // Already selected → toggle scale/rotate mode
        selectHandleMode.value = selectHandleMode.value === "scale" ? "rotate" : "scale";
      } else if (p) {
        selectAll();
        selectHandleMode.value = "scale";
      }
      // Also allow dragging
      if (p) {
        pushUndo();
        dragTarget = { kind: "node", id: p.nodes[0]?.id ?? "" };
        dragStartPos = worldPos;
        snapshotNodes(p);
      }
      draw();
      return;
    }

    // 3) Hit inactive path → switch to it
    if (inactiveHit !== null) {
      setActivePath(inactiveHit);
      const np = ap();
      if (np) {
        selectAll();
        selectHandleMode.value = "scale";
        pushUndo();
        dragTarget = { kind: "node", id: np.nodes[0]?.id ?? "" };
        dragStartPos = worldPos;
        snapshotNodes(np);
      }
      draw();
      return;
    }

    // 4) Click empty → deselect
    deselectAll();
    selectHandleMode.value = "scale";
    draw();
    return;
  }

  // ── Node tool: individual node/handle editing ────────────────────────

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
          dragNodeStartPositions.set(n.id, {
            x: n.x, y: n.y,
            hInX: n.handleIn.x, hInY: n.handleIn.y,
            hOutX: n.handleOut.x, hOutY: n.handleOut.y,
          });
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

  if (nav.movePan(e)) { draw(); return; }

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
    } else if (dragTarget.kind === "scaleHandle" && p) {
      // Scale around bbox center
      const bb = dragTarget.bbox;
      const center = bboxCenter(bb);
      const hw = (bb.maxX - bb.minX) / 2;
      const hh = (bb.maxY - bb.minY) / 2;
      const dx = worldPos.x - center.x;
      const dy = worldPos.y - center.y;
      const sdx = dragTarget.startMouse.x - center.x;
      const sdy = dragTarget.startMouse.y - center.y;
      // Compute scale factors based on handle position
      let sx = 1, sy = 1;
      const pos = dragTarget.pos;
      if (pos.includes("e") || pos.includes("w")) {
        sx = hw > 0.1 ? Math.max(0.01, Math.abs(dx) / hw) * Math.sign(dx) * (sdx > 0 ? 1 : -1) : 1;
      }
      if (pos.includes("n") || pos.includes("s")) {
        sy = hh > 0.1 ? Math.max(0.01, Math.abs(dy) / hh) * Math.sign(dy) * (sdy > 0 ? 1 : -1) : 1;
      }
      // Corner handles scale uniformly when shift is held (or always uniform for corners)
      if ((pos === "nw" || pos === "ne" || pos === "se" || pos === "sw") && !e.shiftKey) {
        const avg = (Math.abs(sx) + Math.abs(sy)) / 2;
        sx = avg * Math.sign(sx);
        sy = avg * Math.sign(sy);
      }
      if (pos === "n" || pos === "s") sx = 1;
      if (pos === "e" || pos === "w") sy = 1;
      for (const n of p.nodes) {
        const sp = dragNodeStartPositions.get(n.id);
        if (!sp) continue;
        n.x = center.x + (sp.x - center.x) * sx;
        n.y = center.y + (sp.y - center.y) * sy;
        n.handleIn  = { x: sp.hInX * sx,  y: sp.hInY * sy };
        n.handleOut = { x: sp.hOutX * sx, y: sp.hOutY * sy };
      }
    } else if (dragTarget.kind === "rotateHandle" && p) {
      // Rotate around bbox center
      const center = bboxCenter(dragTarget.bbox);
      const curAngle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
      const delta = curAngle - dragTarget.startAngle;
      const cosD = Math.cos(delta);
      const sinD = Math.sin(delta);
      for (const n of p.nodes) {
        const sp = dragNodeStartPositions.get(n.id);
        if (!sp) continue;
        const rx = sp.x - center.x;
        const ry = sp.y - center.y;
        n.x = center.x + rx * cosD - ry * sinD;
        n.y = center.y + rx * sinD + ry * cosD;
        n.handleIn  = { x: sp.hInX * cosD - sp.hInY * sinD,  y: sp.hInX * sinD + sp.hInY * cosD };
        n.handleOut = { x: sp.hOutX * cosD - sp.hOutY * sinD, y: sp.hOutX * sinD + sp.hOutY * cosD };
      }
    }

    draw();
    return;
  }

  // Hover
  const nodeHit = hitTestNode(worldPos.x, worldPos.y);
  const handleHitHover = activeTool.value === "node" ? hitTestHandle(worldPos.x, worldPos.y) : null;
  if (hoveredId.value !== nodeHit) { hoveredId.value = nodeHit; draw(); }

  // In select mode, check bbox handles first, then paths
  if (activeTool.value === "select") {
    const el = canvasEl.value;
    if (!el) return;
    const p = ap();
    const bb = p && selectedIds.size > 0 ? getPathBBox(p) : null;
    if (bb) {
      const hh = hitBBoxHandle(screenPos.x, screenPos.y, bb, selectHandleMode.value);
      if (hh) {
        el.style.cursor = selectHandleMode.value === "scale" ? SCALE_CURSORS[hh] : "grab";
        return;
      }
    }
    if (nodeHit) {
      el.style.cursor = "grab";
    } else {
      const inactiveHit = hitTestInactivePath(worldPos.x, worldPos.y);
      el.style.cursor = inactiveHit !== null ? "grab" : "default";
    }
  } else {
    updateCursor(nodeHit, handleHitHover);
  }
}

function onPointerUp(e: MouseEvent) {
  if (nav.endPan()) return;
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
  if (activeTool.value === "select") return; // no node editing in select mode
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
  e.preventDefault();
  const screenPos = getCanvasPos(e);
  nav.onWheel(e, screenPos.x, screenPos.y);
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
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectAll(); draw(); }
      break;
    case "Escape":
      deselectAll(); draw(); break;

    case "s":
      if (!e.ctrlKey && !e.metaKey) { activeTool.value = "select"; }
      break;
    case "n":
      if (!e.ctrlKey && !e.metaKey) { activeTool.value = "node"; }
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
watch(spiralBlendMode, () => draw());
watch(activeTool, () => { selectHandleMode.value = "scale"; draw(); });
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
  // Trigger redraw when spiral worker completes async computation
  initSpiralBackend();
  setSpiralWorkerCallback(() => draw());
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
