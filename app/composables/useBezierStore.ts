/**
 * Bezier path editor — fully isolated store.
 * Supports multiple paths with one "active" path for editing.
 */
import { reactive, ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import type { BezierSpiralConfig, PropCurve, PropNode } from "~/utils/spiral";
import { defaultBezierSpiralConfig, propUid, bumpPropId } from "~/utils/spiral";

// ── Data model ───────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export interface BezierNode {
  id: string;
  /** Absolute position on canvas */
  x: number;
  y: number;
  /** Control handle offsets (relative to node position) */
  handleIn: Vec2;
  handleOut: Vec2;
}

export interface BezierPath {
  id: string;
  name: string;
  nodes: BezierNode[];
  closed: boolean;
  color: string;
  spiral: BezierSpiralConfig;
}

export type DockPosition = "top" | "right" | "bottom" | "left";

// ── Helpers ──────────────────────────────────────────────────────────────────

let _nextId = 1;
function uid(prefix = "n"): string {
  return `${prefix}${_nextId++}`;
}

const PATH_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#06b6d4", "#84cc16",
];

function cloneNode(n: BezierNode, offsetX = 0, offsetY = 0): BezierNode {
  return {
    id: uid(),
    x: n.x + offsetX,
    y: n.y + offsetY,
    handleIn: { ...n.handleIn },
    handleOut: { ...n.handleOut },
  };
}

export function makeNode(x: number, y: number, handleLen = 40): BezierNode {
  return {
    id: uid(),
    x,
    y,
    handleIn: { x: -handleLen, y: 0 },
    handleOut: { x: handleLen, y: 0 },
  };
}

function createPath(name?: string, color?: string): BezierPath {
  const id = uid("p");
  return reactive({
    id,
    name: name ?? `Path ${paths.length + 1}`,
    nodes: [],
    closed: false,
    color: color ?? PATH_COLORS[paths.length % PATH_COLORS.length]!,
    spiral: defaultBezierSpiralConfig(),
  });
}

// ── Layout dock positions ────────────────────────────────────────────────────

const toolbarDock = useStorage<DockPosition>("bezier-toolbar-dock", "top");
const propsDock = useStorage<DockPosition>("bezier-props-dock", "right");
const showSpines = ref(true);

const BLEND_MODES = [
  "source-over", "screen", "multiply", "overlay",
  "lighten", "darken", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity",
] as const;
export type BlendMode = typeof BLEND_MODES[number];
const spiralBlendMode = useStorage<BlendMode>("bezier-spiral-blend", "screen");

// ── Module-level singletons ──────────────────────────────────────────────────

const paths: BezierPath[] = reactive([]);
const activePathIndex = ref(0);

/** The currently active path (all node ops target this) */
const path = computed(() => paths[activePathIndex.value] ?? null);

const selectedIds = reactive(new Set<string>());
const hoveredId = ref<string | null>(null);

type Mode = "idle" | "drawingNew";
const mode = ref<Mode>("idle");

// Initialise with one path
paths.push(createPath("Path 1"));

// ── Multi-path actions ───────────────────────────────────────────────────────

function addPath(): BezierPath {
  pushUndo();
  const p = createPath();
  paths.push(p);
  activePathIndex.value = paths.length - 1;
  selectedIds.clear();
  return p;
}

function removePath(index: number) {
  if (paths.length <= 1) return; // keep at least one
  pushUndo();
  paths.splice(index, 1);
  if (activePathIndex.value >= paths.length) {
    activePathIndex.value = paths.length - 1;
  }
  selectedIds.clear();
}

function setActivePath(index: number) {
  if (index < 0 || index >= paths.length) return;
  activePathIndex.value = index;
  selectedIds.clear();
}

function duplicatePath(index: number) {
  pushUndo();
  const src = paths[index];
  if (!src) return;
  const p = createPath(`${src.name} copy`);
  for (const n of src.nodes) {
    p.nodes.push(cloneNode(n));
  }
  p.closed = src.closed;
  // Deep-copy spiral config
  p.spiral.enabled = src.spiral.enabled;
  for (const key of ["radius", "elliptic", "orientation", "frequency", "speed"] as const) {
    const srcCurve = src.spiral[key];
    p.spiral[key].nodes.splice(0, p.spiral[key].nodes.length,
      ...srcCurve.nodes.map(n => ({ ...n, id: propUid(), handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut } })),
    );
  }
  paths.push(p);
  activePathIndex.value = paths.length - 1;
  selectedIds.clear();
}

function renamePath(index: number, name: string) {
  const p = paths[index];
  if (p) p.name = name;
}

function setPathColor(index: number, color: string) {
  const p = paths[index];
  if (p) p.color = color;
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────

interface PropNodeSnap {
  id: string; t: number; value: number;
  handleIn: { dt: number; dv: number };
  handleOut: { dt: number; dv: number };
}

interface PropCurveSnap {
  nodes: PropNodeSnap[];
  min: number;
  max: number;
}

interface SpiralSnap {
  enabled: boolean;
  radius: PropCurveSnap;
  elliptic: PropCurveSnap;
  orientation: PropCurveSnap;
  frequency: PropCurveSnap;
  speed: PropCurveSnap;
}

interface PathSnapshot {
  id: string;
  name: string;
  nodes: { id: string; x: number; y: number; handleIn: Vec2; handleOut: Vec2 }[];
  closed: boolean;
  color: string;
  spiral: SpiralSnap;
}

interface Snapshot {
  paths: PathSnapshot[];
  activePathIndex: number;
  selected: string[];
}

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
const MAX_UNDO = 200;

const canUndo = ref(false);
const canRedo = ref(false);

function snapPropCurve(c: PropCurve): PropCurveSnap {
  return { nodes: c.nodes.map(n => ({ id: n.id, t: n.t, value: n.value, handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut } })), min: c.min, max: c.max };
}

function snapSpiral(s: BezierSpiralConfig): SpiralSnap {
  return {
    enabled: s.enabled,
    radius: snapPropCurve(s.radius),
    elliptic: snapPropCurve(s.elliptic),
    orientation: snapPropCurve(s.orientation),
    frequency: snapPropCurve(s.frequency),
    speed: snapPropCurve(s.speed),
  };
}

function takeSnapshot(): Snapshot {
  return {
    paths: paths.map(p => ({
      id: p.id,
      name: p.name,
      nodes: p.nodes.map(n => ({
        id: n.id, x: n.x, y: n.y,
        handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut },
      })),
      closed: p.closed,
      color: p.color,
      spiral: snapSpiral(p.spiral),
    })),
    activePathIndex: activePathIndex.value,
    selected: [...selectedIds],
  };
}

function restorePropCurve(target: PropCurve, snap: PropCurveSnap) {
  target.nodes.splice(0, target.nodes.length,
    ...snap.nodes.map(n => ({ id: n.id, t: n.t, value: n.value, handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut } })),
  );
  if (snap.min !== undefined) target.min = snap.min;
  if (snap.max !== undefined) target.max = snap.max;
}

function applySnapshot(snap: Snapshot) {
  paths.splice(0, paths.length);
  for (const ps of snap.paths) {
    const sp = defaultBezierSpiralConfig();
    sp.enabled = ps.spiral.enabled;
    restorePropCurve(sp.radius, ps.spiral.radius);
    restorePropCurve(sp.elliptic, ps.spiral.elliptic);
    restorePropCurve(sp.orientation, ps.spiral.orientation);
    restorePropCurve(sp.frequency, ps.spiral.frequency);
    restorePropCurve(sp.speed, ps.spiral.speed);
    const p: BezierPath = reactive({
      id: ps.id,
      name: ps.name,
      nodes: ps.nodes.map(n => ({
        id: n.id, x: n.x, y: n.y,
        handleIn: { ...n.handleIn }, handleOut: { ...n.handleOut },
      })),
      closed: ps.closed,
      color: ps.color,
      spiral: sp,
    });
    paths.push(p);
  }
  activePathIndex.value = snap.activePathIndex;
  selectedIds.clear();
  for (const id of snap.selected) selectedIds.add(id);
  // Keep id counter above any restored id
  for (const ps of snap.paths) {
    const pNum = parseInt(ps.id.slice(1));
    if (pNum >= _nextId) _nextId = pNum + 1;
    for (const n of ps.nodes) {
      const num = parseInt(n.id.slice(1));
      if (num >= _nextId) _nextId = num + 1;
    }
    // Restore prop node ids
    for (const key of ["radius", "elliptic", "orientation", "frequency", "speed"] as const) {
      for (const pn of ps.spiral[key].nodes) bumpPropId(pn.id);
    }
  }
}

function pushUndo() {
  undoStack.push(takeSnapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  canUndo.value = undoStack.length > 0;
  canRedo.value = false;
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(takeSnapshot());
  applySnapshot(undoStack.pop()!);
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(takeSnapshot());
  applySnapshot(redoStack.pop()!);
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
}

// ── Computed ─────────────────────────────────────────────────────────────────

const selectedNodes = computed(() =>
  path.value ? path.value.nodes.filter((n) => selectedIds.has(n.id)) : [],
);

const hasSelection = computed(() => selectedIds.size > 0);

// ── Selection actions ────────────────────────────────────────────────────────

function select(id: string, additive = false) {
  if (!additive) selectedIds.clear();
  selectedIds.add(id);
}

function deselect(id: string) {
  selectedIds.delete(id);
}

function toggleSelect(id: string) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
}

function selectAll() {
  if (!path.value) return;
  for (const n of path.value.nodes) selectedIds.add(n.id);
}

function deselectAll() {
  selectedIds.clear();
}

function selectRect(x1: number, y1: number, x2: number, y2: number, additive = false) {
  if (!additive) selectedIds.clear();
  if (!path.value) return;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (const n of path.value.nodes) {
    if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
      selectedIds.add(n.id);
    }
  }
}

// ── Node manipulation ────────────────────────────────────────────────────────

function addNode(x: number, y: number): BezierNode | null {
  if (!path.value) return null;
  pushUndo();
  const n = makeNode(x, y);
  const prev = path.value.nodes[path.value.nodes.length - 1];
  if (prev) {
    const dx = x - prev.x;
    const dy = y - prev.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const len = d * 0.33;
    const ux = dx / d;
    const uy = dy / d;
    n.handleIn = { x: -ux * len, y: -uy * len };
    n.handleOut = { x: ux * len, y: uy * len };
  }
  path.value.nodes.push(n);
  return n;
}

function insertNodeAfter(afterId: string, x: number, y: number): BezierNode | null {
  if (!path.value) return null;
  const idx = path.value.nodes.findIndex((n) => n.id === afterId);
  if (idx === -1) return addNode(x, y);
  pushUndo();
  const n = makeNode(x, y);
  path.value.nodes.splice(idx + 1, 0, n);
  return n;
}

function insertNodeOnSegment(segIdx: number, t = 0.5): BezierNode | null {
  if (!path.value) return null;
  if (segIdx < 0 || segIdx >= segmentCount()) return null;
  pushUndo();
  const a = path.value.nodes[segIdx]!;
  const b = path.value.nodes[(segIdx + 1) % path.value.nodes.length]!;

  const p0: Vec2 = { x: a.x, y: a.y };
  const p1: Vec2 = { x: a.x + a.handleOut.x, y: a.y + a.handleOut.y };
  const p2: Vec2 = { x: b.x + b.handleIn.x, y: b.y + b.handleIn.y };
  const p3: Vec2 = { x: b.x, y: b.y };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  });

  const q0 = lerpV(p0, p1, t);
  const q1 = lerpV(p1, p2, t);
  const q2 = lerpV(p2, p3, t);
  const r0 = lerpV(q0, q1, t);
  const r1 = lerpV(q1, q2, t);
  const s = lerpV(r0, r1, t);

  a.handleOut = { x: q0.x - a.x, y: q0.y - a.y };
  b.handleIn = { x: q2.x - b.x, y: q2.y - b.y };

  const n: BezierNode = {
    id: uid(),
    x: s.x,
    y: s.y,
    handleIn: { x: r0.x - s.x, y: r0.y - s.y },
    handleOut: { x: r1.x - s.x, y: r1.y - s.y },
  };

  path.value.nodes.splice(segIdx + 1, 0, n);
  return n;
}

function removeSelected() {
  if (!path.value || selectedIds.size === 0) return;
  pushUndo();
  const keep = path.value.nodes.filter((n) => !selectedIds.has(n.id));
  path.value.nodes.splice(0, path.value.nodes.length, ...keep);
  selectedIds.clear();
}

function removeNode(id: string) {
  if (!path.value) return;
  const idx = path.value.nodes.findIndex((n) => n.id === id);
  if (idx !== -1) {
    pushUndo();
    path.value.nodes.splice(idx, 1);
    selectedIds.delete(id);
  }
}

function moveSelected(dx: number, dy: number) {
  if (!path.value) return;
  for (const n of path.value.nodes) {
    if (selectedIds.has(n.id)) {
      n.x += dx;
      n.y += dy;
    }
  }
}

// ── Path-level actions (operate on active path) ──────────────────────────────

function segmentCount(): number {
  if (!path.value || path.value.nodes.length < 2) return 0;
  return path.value.closed ? path.value.nodes.length : path.value.nodes.length - 1;
}

function toggleClosed() {
  if (!path.value) return;
  pushUndo();
  path.value.closed = !path.value.closed;
}

function reversePath() {
  if (!path.value) return;
  pushUndo();
  path.value.nodes.reverse();
  for (const n of path.value.nodes) {
    const tmp = n.handleIn;
    n.handleIn = n.handleOut;
    n.handleOut = tmp;
  }
}

function mirrorX() {
  if (!hasSelection.value) return;
  pushUndo();
  const sel = selectedNodes.value;
  const cx = sel.reduce((s, n) => s + n.x, 0) / sel.length;
  for (const n of sel) {
    n.x = 2 * cx - n.x;
    n.handleIn.x = -n.handleIn.x;
    n.handleOut.x = -n.handleOut.x;
  }
}

function mirrorY() {
  if (!hasSelection.value) return;
  pushUndo();
  const sel = selectedNodes.value;
  const cy = sel.reduce((s, n) => s + n.y, 0) / sel.length;
  for (const n of sel) {
    n.y = 2 * cy - n.y;
    n.handleIn.y = -n.handleIn.y;
    n.handleOut.y = -n.handleOut.y;
  }
}

function duplicateSelected(offsetX = 30, offsetY = 30) {
  if (!path.value || !hasSelection.value) return;
  pushUndo();
  const clones: BezierNode[] = [];
  let lastIdx = -1;
  for (let i = 0; i < path.value.nodes.length; i++) {
    if (selectedIds.has(path.value.nodes[i]!.id)) lastIdx = i;
  }
  for (const n of path.value.nodes) {
    if (selectedIds.has(n.id)) {
      clones.push(cloneNode(n, offsetX, offsetY));
    }
  }
  path.value.nodes.splice(lastIdx + 1, 0, ...clones);
  selectedIds.clear();
  for (const c of clones) selectedIds.add(c.id);
}

function alignSelectedX() {
  if (selectedIds.size < 2) return;
  pushUndo();
  const sel = selectedNodes.value;
  const avgX = sel.reduce((s, n) => s + n.x, 0) / sel.length;
  for (const n of sel) n.x = avgX;
}

function alignSelectedY() {
  if (selectedIds.size < 2) return;
  pushUndo();
  const sel = selectedNodes.value;
  const avgY = sel.reduce((s, n) => s + n.y, 0) / sel.length;
  for (const n of sel) n.y = avgY;
}

function distributeX() {
  if (selectedIds.size < 3) return;
  pushUndo();
  const sel = [...selectedNodes.value].sort((a, b) => a.x - b.x);
  const minX = sel[0]!.x;
  const maxX = sel[sel.length - 1]!.x;
  const step = (maxX - minX) / (sel.length - 1);
  for (let i = 0; i < sel.length; i++) sel[i]!.x = minX + step * i;
}

function distributeY() {
  if (selectedIds.size < 3) return;
  pushUndo();
  const sel = [...selectedNodes.value].sort((a, b) => a.y - b.y);
  const minY = sel[0]!.y;
  const maxY = sel[sel.length - 1]!.y;
  const step = (maxY - minY) / (sel.length - 1);
  for (let i = 0; i < sel.length; i++) sel[i]!.y = minY + step * i;
}

function clearPath() {
  if (!path.value || path.value.nodes.length === 0) return;
  pushUndo();
  path.value.nodes.splice(0, path.value.nodes.length);
  path.value.closed = false;
  selectedIds.clear();
}

function smoothSelected() {
  if (!path.value || selectedIds.size === 0) return;
  pushUndo();
  for (const n of path.value.nodes) {
    if (!selectedIds.has(n.id)) continue;
    const idx = path.value.nodes.indexOf(n);
    const prev = path.value.nodes[idx - 1] ?? (path.value.closed ? path.value.nodes[path.value.nodes.length - 1] : null);
    const next = path.value.nodes[idx + 1] ?? (path.value.closed ? path.value.nodes[0] : null);
    if (!prev && !next) continue;
    const px = (next?.x ?? n.x) - (prev?.x ?? n.x);
    const py = (next?.y ?? n.y) - (prev?.y ?? n.y);
    const len = Math.sqrt(px * px + py * py) || 1;
    const ux = px / len;
    const uy = py / len;
    const handleLen = len * 0.25;
    n.handleIn = { x: -ux * handleLen, y: -uy * handleLen };
    n.handleOut = { x: ux * handleLen, y: uy * handleLen };
  }
}

function symmetrizeHandles() {
  if (!path.value || selectedIds.size === 0) return;
  pushUndo();
  for (const n of path.value.nodes) {
    if (!selectedIds.has(n.id)) continue;
    const len = Math.sqrt(n.handleOut.x ** 2 + n.handleOut.y ** 2);
    const inLen = Math.sqrt(n.handleIn.x ** 2 + n.handleIn.y ** 2);
    if (inLen > 0) {
      const scale = len / inLen;
      n.handleOut = { x: -n.handleIn.x * scale, y: -n.handleIn.y * scale };
    }
  }
}

// ── Composable export ────────────────────────────────────────────────────────

export function useBezierStore() {
  return {
    // State
    paths,
    path,
    activePathIndex,
    selectedIds,
    hoveredId,
    mode,

    // Computed
    selectedNodes,
    hasSelection,

    // Multi-path ops
    addPath,
    removePath,
    setActivePath,
    duplicatePath,
    renamePath,
    setPathColor,

    // Selection
    select,
    deselect,
    toggleSelect,
    selectAll,
    deselectAll,
    selectRect,

    // Node ops
    addNode,
    insertNodeAfter,
    insertNodeOnSegment,
    removeSelected,
    removeNode,
    moveSelected,

    // Undo / Redo
    pushUndo,
    undo,
    redo,
    canUndo,
    canRedo,

    // Path ops
    segmentCount,
    toggleClosed,
    reversePath,
    mirrorX,
    mirrorY,
    duplicateSelected,
    alignSelectedX,
    alignSelectedY,
    distributeX,
    distributeY,
    clearPath,
    smoothSelected,
    symmetrizeHandles,

    // Layout
    toolbarDock,
    propsDock,
    showSpines,
    spiralBlendMode,
    BLEND_MODES,
  };
}
