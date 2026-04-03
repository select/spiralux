/**
 * useCanvasRenderer — shared rendering logic for bezier paths + spirals.
 * Used by both the main BezierCanvas and the Evolution grid cells.
 */
import type { BezierPath, BezierNode, Vec2 } from "~/composables/useBezierStore";
import type { BezierSpiralConfig } from "~/utils/spiral";
import { sampleBezierPath, generateSpiralPoints } from "~/utils/spiral";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RenderablePath {
  nodes: { x: number; y: number; handleIn: Vec2; handleOut: Vec2 }[];
  closed: boolean;
  color: string;
  visible: boolean;
  spiral: BezierSpiralConfig;
}

export interface CanvasView {
  panX: number;
  panY: number;
  zoom: number;
}

// ── CSS helper ───────────────────────────────────────────────────────────────

function cssProp(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ── Path geometry ────────────────────────────────────────────────────────────

export function estimatePathLength(nodes: RenderablePath["nodes"], closed: boolean): number {
  const segCount = closed ? nodes.length : nodes.length - 1;
  if (segCount <= 0) return 0;
  let len = 0;
  const stepsPerSeg = 20;
  for (let seg = 0; seg < segCount; seg++) {
    const a = nodes[seg]!;
    const b = nodes[(seg + 1) % nodes.length]!;
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

// ── Drawing primitives ───────────────────────────────────────────────────────

export function drawPathCurves(
  ctx: CanvasRenderingContext2D,
  nodes: RenderablePath["nodes"],
  closed: boolean,
  color: string,
  lineWidth: number,
) {
  const segCount = closed ? nodes.length : nodes.length - 1;
  for (let seg = 0; seg < segCount; seg++) {
    const a = nodes[seg]!;
    const b = nodes[(seg + 1) % nodes.length]!;
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

export function drawPathSpiral(
  ctx: CanvasRenderingContext2D,
  path: RenderablePath,
  alpha: number,
  zoomLevel: number,
  blendMode: string = "source-over",
) {
  if (!path.spiral.enabled || path.nodes.length < 2) return;
  const prevComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;

  const pathLen = estimatePathLength(path.nodes, path.closed);
  const maxFreq = Math.max(...path.spiral.frequency.nodes.map(n => n.value), 1);
  const numSamples = Math.max(600, Math.min(20000, Math.round(pathLen * maxFreq * 0.5)));
  const samples = sampleBezierPath(path.nodes, path.closed, numSamples);
  const pts = generateSpiralPoints(samples, path.spiral);
  if (pts.length < 2) { ctx.globalCompositeOperation = prevComposite; return; }

  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, "0");
  ctx.strokeStyle = path.color + alphaHex;
  ctx.lineWidth = 1.2 / zoomLevel;
  ctx.stroke();
  ctx.globalCompositeOperation = prevComposite;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  view: CanvasView,
) {
  const gridSize = 50;
  const z = view.zoom;
  const ox = view.panX;
  const oy = view.panY;

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

  for (let x = xMin; x <= xMax; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, yMin);
    ctx.lineTo(x, yMax);
    ctx.stroke();
  }
  for (let y = yMin; y <= yMax; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(xMin, y);
    ctx.lineTo(xMax, y);
    ctx.stroke();
  }

  // Origin cross
  ctx.strokeStyle = `rgba(${cssProp("--text-muted", "120 120 150")} / 0.18)`;
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.moveTo(0, yMin);
  ctx.lineTo(0, yMax);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xMin, 0);
  ctx.lineTo(xMax, 0);
  ctx.stroke();
}

/**
 * Render paths onto a canvas with given view (pan/zoom).
 * Draws grid, inactive paths (dimmed), active path (bright), spirals.
 */
export function renderPaths(
  canvas: HTMLCanvasElement,
  paths: RenderablePath[],
  activeIndex: number,
  view: CanvasView,
  options: {
    showSpines?: boolean;
    blendMode?: string;
    /** Draw handles/nodes for active path selection state */
    selectedIds?: Set<string>;
    hoveredId?: string | null;
  } = {},
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.resetTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { showSpines = true, blendMode = "source-over", selectedIds, hoveredId } = options;
  const z = view.zoom;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(z, z);

  drawGrid(ctx, rect.width, rect.height, view);

  const selectedColor = "#22d3ee";
  const handleColor = "#f59e0b";
  const NODE_RADIUS = 5;
  const HANDLE_RADIUS = 3.5;

  // Inactive paths
  for (let pi = 0; pi < paths.length; pi++) {
    if (pi === activeIndex) continue;
    const p = paths[pi]!;
    if (p.nodes.length === 0 || !p.visible) continue;
    if (showSpines) {
      drawPathCurves(ctx, p.nodes, p.closed, p.color + "80", 2 / z);
      for (const n of p.nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 3 / z, 0, Math.PI * 2);
        ctx.fillStyle = p.color + "60";
        ctx.fill();
      }
    }
    drawPathSpiral(ctx, p, 0.4, z, blendMode);
  }

  // Active path
  const ap = paths[activeIndex];
  if (ap && ap.nodes.length > 0 && ap.visible) {
    if (showSpines) drawPathCurves(ctx, ap.nodes, ap.closed, ap.color, 2.5 / z);
    drawPathSpiral(ctx, ap, 0.85, z, blendMode);

    // Handles & nodes (only when selectedIds is provided — editor mode)
    if (showSpines && selectedIds) {
      for (const n of ap.nodes) {
        const nNode = n as BezierNode;
        const isSelected = selectedIds.has(nNode.id ?? "");
        const isHovered = hoveredId === (nNode.id ?? "");

        const hInAbs = { x: n.x + n.handleIn.x, y: n.y + n.handleIn.y };
        const hOutAbs = { x: n.x + n.handleOut.x, y: n.y + n.handleOut.y };

        // Handle lines
        ctx.beginPath();
        ctx.moveTo(hInAbs.x, hInAbs.y);
        ctx.lineTo(n.x, n.y);
        ctx.lineTo(hOutAbs.x, hOutAbs.y);
        ctx.strokeStyle = isSelected ? selectedColor : handleColor;
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([4 / z, 3 / z]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Handle dots
        for (const hp of [hInAbs, hOutAbs]) {
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, HANDLE_RADIUS / z, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? selectedColor : handleColor;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.lineWidth = 0.5 / z;
          ctx.stroke();
        }

        // Node dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, NODE_RADIUS / z, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? selectedColor : isHovered ? "#a5b4fc" : ap.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1 / z;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}
