/**
 * Spiral rendering along a bezier backbone path.
 * Property curves control radius, elliptic distortion, orientation, frequency.
 */

import type { BezierNode, Vec2 } from "~/composables/useBezierStore";

// ── Property curve data model ────────────────────────────────────────────────

export interface PropNode {
  id: string;
  /** 0–1 position along the backbone path */
  t: number;
  /** Property value */
  value: number;
  /** Handle offsets relative to node (dt, dvalue) */
  handleIn: { dt: number; dv: number };
  handleOut: { dt: number; dv: number };
}

export interface PropCurve {
  label: string;
  color: string;
  min: number;
  max: number;
  unit: string;
  nodes: PropNode[];
}

export interface BezierSpiralConfig {
  enabled: boolean;
  radius: PropCurve;
  elliptic: PropCurve;
  orientation: PropCurve;
  frequency: PropCurve;
}

// ── ID generator (shared with main store via import) ─────────────────────────

let _pid = 1;
export function propUid(): string { return `pn${_pid++}`; }
export function bumpPropId(id: string) {
  const n = parseInt(id.replace(/\D/g, ""));
  if (n >= _pid) _pid = n + 1;
}

// ── Default curves ───────────────────────────────────────────────────────────

function makePropNode(t: number, value: number, handleLen = 0.15): PropNode {
  return {
    id: propUid(),
    t,
    value,
    handleIn: { dt: -handleLen, dv: 0 },
    handleOut: { dt: handleLen, dv: 0 },
  };
}

export function defaultBezierSpiralConfig(): BezierSpiralConfig {
  return {
    enabled: true,
    radius: {
      label: "Radius",
      color: "#6366f1",
      min: 0,
      max: 100,
      unit: "px",
      nodes: [makePropNode(0, 20), makePropNode(1, 20)],
    },
    elliptic: {
      label: "Elliptic",
      color: "#f59e0b",
      min: 0,
      max: 3,
      unit: "×",
      nodes: [makePropNode(0, 1), makePropNode(1, 1)],
    },
    orientation: {
      label: "Orient°",
      color: "#10b981",
      min: 0,
      max: 360,
      unit: "°",
      nodes: [makePropNode(0, 0), makePropNode(1, 0)],
    },
    frequency: {
      label: "Freq",
      color: "#ef4444",
      min: 0.5,
      max: 60,
      unit: "/len",
      nodes: [makePropNode(0, 12), makePropNode(1, 12)],
    },
  };
}

// ── Evaluate a property curve at position t (0–1) ────────────────────────────

function cubicBezier1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const mu = 1 - u;
  return mu * mu * mu * p0 + 3 * mu * mu * u * p1 + 3 * mu * u * u * p2 + u * u * u * p3;
}

export function evaluatePropCurve(curve: PropCurve, t: number): number {
  const nodes = curve.nodes;
  if (nodes.length === 0) return (curve.min + curve.max) / 2;
  if (nodes.length === 1) return nodes[0]!.value;
  if (t <= nodes[0]!.t) return nodes[0]!.value;
  if (t >= nodes[nodes.length - 1]!.t) return nodes[nodes.length - 1]!.value;

  // Find segment
  let segIdx = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    if (t >= nodes[i]!.t && t <= nodes[i + 1]!.t) { segIdx = i; break; }
  }

  const a = nodes[segIdx]!;
  const b = nodes[segIdx + 1]!;

  // Control points in (t, value) space
  const p0t = a.t;
  const p1t = a.t + a.handleOut.dt;
  const p2t = b.t + b.handleIn.dt;
  const p3t = b.t;

  const p0v = a.value;
  const p1v = a.value + a.handleOut.dv;
  const p2v = b.value + b.handleIn.dv;
  const p3v = b.value;

  // Binary search for u where bezier_t(u) = t
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const tMid = cubicBezier1D(p0t, p1t, p2t, p3t, mid);
    if (tMid < t) lo = mid; else hi = mid;
  }
  const u = (lo + hi) / 2;

  return cubicBezier1D(p0v, p1v, p2v, p3v, u);
}

// ── Sample a bezier path backbone ────────────────────────────────────────────

export interface PathSample {
  x: number;
  y: number;
  tx: number; // tangent x (normalized)
  ty: number; // tangent y (normalized)
  nx: number; // normal x (perpendicular to tangent, left)
  ny: number; // normal y
  t: number;  // 0–1 parametric position along entire path
}

function evalCubic(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1 - u;
  return {
    x: mu * mu * mu * a.x + 3 * mu * mu * u * (a.x + a.handleOut.x) + 3 * mu * u * u * (b.x + b.handleIn.x) + u * u * u * b.x,
    y: mu * mu * mu * a.y + 3 * mu * mu * u * (a.y + a.handleOut.y) + 3 * mu * u * u * (b.y + b.handleIn.y) + u * u * u * b.y,
  };
}

function evalCubicDerivative(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1 - u;
  const p0x = a.x, p1x = a.x + a.handleOut.x, p2x = b.x + b.handleIn.x, p3x = b.x;
  const p0y = a.y, p1y = a.y + a.handleOut.y, p2y = b.y + b.handleIn.y, p3y = b.y;
  return {
    x: 3 * mu * mu * (p1x - p0x) + 6 * mu * u * (p2x - p1x) + 3 * u * u * (p3x - p2x),
    y: 3 * mu * mu * (p1y - p0y) + 6 * mu * u * (p2y - p1y) + 3 * u * u * (p3y - p2y),
  };
}

export function sampleBezierPath(
  nodes: BezierNode[],
  closed: boolean,
  numSamples: number,
): PathSample[] {
  const segCount = closed ? nodes.length : nodes.length - 1;
  if (segCount <= 0 || nodes.length < 2) return [];

  const samples: PathSample[] = [];
  const samplesPerSeg = Math.max(2, Math.ceil(numSamples / segCount));

  // First pass: collect samples with parametric t and compute cumulative arc length
  const arcLengths: number[] = [];
  let totalArc = 0;

  for (let seg = 0; seg < segCount; seg++) {
    const a = nodes[seg]!;
    const b = nodes[(seg + 1) % nodes.length]!;

    for (let i = 0; i <= samplesPerSeg; i++) {
      if (seg > 0 && i === 0) continue; // avoid duplicate at segment boundaries
      const u = i / samplesPerSeg;
      const pos = evalCubic(a, b, u);
      const deriv = evalCubicDerivative(a, b, u);
      const len = Math.sqrt(deriv.x * deriv.x + deriv.y * deriv.y) || 1;
      const tx = deriv.x / len;
      const ty = deriv.y / len;

      if (samples.length > 0) {
        const prev = samples[samples.length - 1]!;
        totalArc += Math.sqrt((pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2);
      }
      arcLengths.push(totalArc);

      samples.push({
        x: pos.x,
        y: pos.y,
        tx,
        ty,
        nx: -ty, // left-pointing normal
        ny: tx,
        t: 0, // will be set in second pass
      });
    }
  }

  // Second pass: set t to arc-length parameterized [0, 1]
  const invTotal = totalArc > 0 ? 1 / totalArc : 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i]!.t = arcLengths[i]! * invTotal;
  }

  return samples;
}

// ── Generate spiral points along a sampled path ──────────────────────────────

export function generateSpiralPoints(
  samples: PathSample[],
  config: BezierSpiralConfig,
): Vec2[] {
  if (samples.length < 2 || !config.enabled) return [];

  // ── Pre-compute per-sample curvature (smoothed) ──
  // We need smoothed backbone curvature to reduce coil density on tight curves.
  const N = samples.length;
  const rawCurvature = new Float64Array(N);
  const ds = new Float64Array(N);  // arc-length step to previous sample

  for (let i = 1; i < N; i++) {
    const prev = samples[i - 1]!, s = samples[i]!;
    const dx = s.x - prev.x, dy = s.y - prev.y;
    ds[i] = Math.sqrt(dx * dx + dy * dy);
    const cross = prev.tx * s.ty - prev.ty * s.tx;
    rawCurvature[i] = ds[i]! > 0.001 ? cross / ds[i]! : 0;
  }
  rawCurvature[0] = rawCurvature[1] ?? 0;

  // Smooth curvature over a window (~1 full coil width)
  // Use a running average with window proportional to coil size
  const smoothK = new Float64Array(N);
  const WINDOW = Math.max(5, Math.round(N * 0.02)); // ~2% of total samples
  let sum = 0;
  for (let i = 0; i < Math.min(WINDOW, N); i++) sum += rawCurvature[i]!;
  for (let i = 0; i < N; i++) {
    const lo = i - Math.floor(WINDOW / 2);
    const hi = lo + WINDOW;
    if (hi <= N && lo >= 0) {
      smoothK[i] = sum / WINDOW;
      sum -= rawCurvature[lo]!;
      if (hi < N) sum += rawCurvature[hi]!;
    } else {
      // Edge: compute directly
      const start = Math.max(0, lo), end = Math.min(N, hi);
      let s2 = 0;
      for (let j = start; j < end; j++) s2 += rawCurvature[j]!;
      smoothK[i] = s2 / (end - start);
    }
  }

  // ── Generate spiral points ──
  const points: Vec2[] = [];
  let cumulativeAngle = 0;

  for (let i = 0; i < N; i++) {
    const s = samples[i]!;
    const t = s.t;

    const radius = evaluatePropCurve(config.radius, t);
    const elliptic = evaluatePropCurve(config.elliptic, t);
    const orientDeg = evaluatePropCurve(config.orientation, t);
    const freq = evaluatePropCurve(config.frequency, t);

    if (i > 0) {
      // Curvature compensation: on tight curves the coils physically
      // overlap on the inside, so we reduce the angular rate proportionally
      // to |κ| × radius.  This keeps coil-to-coil spacing visually uniform.
      const absK = Math.abs(smoothK[i]!);
      const compensation = 1 / Math.max(1, absK * radius * 0.5);
      cumulativeAngle += freq * ds[i]! * 0.05 * compensation;
    }

    const orientRad = (orientDeg * Math.PI) / 180;
    const cosA = Math.cos(cumulativeAngle);
    const sinA = Math.sin(cumulativeAngle);

    let localT = radius * cosA;
    let localN = radius * elliptic * sinA;

    const cosO = Math.cos(orientRad);
    const sinO = Math.sin(orientRad);
    const rotT = localT * cosO - localN * sinO;
    const rotN = localT * sinO + localN * cosO;

    points.push({
      x: s.x + rotT * s.nx + rotN * s.tx,
      y: s.y + rotT * s.ny + rotN * s.ty,
    });
  }

  return points;
}
