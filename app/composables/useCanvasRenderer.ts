/**
 * useCanvasRenderer — shared rendering logic for bezier paths + spirals.
 * Used by both the main BezierCanvas and the Evolution grid cells.
 */
import type { BezierNode, Vec2 } from "~/composables/useBezierStore";
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
  const maxRadius = Math.max(...path.spiral.radius.nodes.map(n => n.value), 1);
  const minRadius = Math.min(...path.spiral.radius.nodes.map(n => n.value), maxRadius);
  // More samples when radius varies a lot (travel compensation speeds up angular rate at small radius)
  const radiusRatio = minRadius > 0.1 ? maxRadius / Math.max(minRadius, maxRadius * 0.2) : 5;
  const numSamples = Math.max(800, Math.min(40000, Math.round(pathLen * maxFreq * 0.5 * radiusRatio)));
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
  // 1 mm = 96/25.4 CSS px; drawn in world space so it scales with zoom (physical mm preview)
  const MM_TO_PX = 96 / 25.4;
  ctx.lineWidth = (path.spiral.lineWidth ?? 0.3) * MM_TO_PX;
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
    /** SVG template image to draw in world-space (pans/zooms with canvas) */
    templateImg?: HTMLImageElement | null;
    /** Arc-length t (0–1) of the selected property-curve node — shown as a marker on the active path's spine */
    spiralCursorT?: number | null;
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

  const { showSpines = true, blendMode = "source-over", selectedIds, hoveredId, templateImg, spiralCursorT } = options;
  const z = view.zoom;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(z, z);

  drawGrid(ctx, rect.width, rect.height, view);

  // Template SVG — drawn in world space so it pans/zooms with the canvas.
  // The SVG's natural pixel dimensions already encode physical mm size
  // (browser renders mm-unit SVGs at 96 dpi → 1px = 1 CSS px = 1/96in = 25.4/96 mm).
  if (templateImg && templateImg.complete && templateImg.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(templateImg, 0, 0, templateImg.naturalWidth, templateImg.naturalHeight);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

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
      drawPathCurves(ctx, p.nodes, p.closed, `${p.color}80`, 2 / z);
      for (const n of p.nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 3 / z, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}60`;
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

  // ── Spiral cursor marker ──────────────────────────────────────────────────
  // Red dot on the active path's spine at the arc-length position of the
  // currently selected property-curve node.
  if (spiralCursorT !== null && spiralCursorT !== undefined && showSpines && activeIndex >= 0) {
    const cursorPath = paths[activeIndex];
    if (cursorPath && cursorPath.nodes.length >= 2) {
      const samples = sampleBezierPath(cursorPath.nodes as BezierNode[], cursorPath.closed ?? false, 200);
      if (samples.length >= 2) {
        // Linear interpolation through arc-length-parameterised samples
        let sx = samples[0]!.x, sy = samples[0]!.y;
        for (let i = 1; i < samples.length; i++) {
          const smp = samples[i]!;
          if (smp.t >= spiralCursorT || i === samples.length - 1) {
            const prev = samples[i - 1]!;
            const span = smp.t - prev.t;
            const frac = span > 0 ? (spiralCursorT - prev.t) / span : 0;
            sx = prev.x + (smp.x - prev.x) * frac;
            sy = prev.y + (smp.y - prev.y) * frac;
            break;
          }
        }
        const r = 5 / z;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.5 / z;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  ctx.restore();
}
