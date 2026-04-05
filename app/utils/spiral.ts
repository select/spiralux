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
  /** Stroke width in millimetres */
  lineWidth: number;
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
    lineWidth: 0.3,
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

  // Travel compensation: scale angular rate inversely with radius so that
  // larger coils advance the centerpoint further per revolution, keeping
  // spine crossing intervals approximately uniform.
  //
  // Linear radius growth already produces even crossings, so we only apply
  // correction where the radius curve is non-linear. We measure this via
  // the second derivative (curvature) of the radius curve at each point:
  // zero for linear segments, nonzero where the curve bends.
  const NUM_REF_SAMPLES = 64;
  const rSamples: number[] = [];
  let radiusMax = 0;
  for (let i = 0; i < NUM_REF_SAMPLES; i++) {
    const r = evaluatePropCurve(config.radius, i / (NUM_REF_SAMPLES - 1));
    rSamples.push(r);
    if (r > radiusMax) radiusMax = r;
  }
  // Pre-compute max |d²r/dt²| for normalization
  let maxAccel = 0;
  for (let i = 1; i < NUM_REF_SAMPLES - 1; i++) {
    const accel = Math.abs(rSamples[i + 1]! - 2 * rSamples[i]! + rSamples[i - 1]!);
    if (accel > maxAccel) maxAccel = accel;
  }
  const radiusFloor = radiusMax * 0.2;

  const points: Vec2[] = [];
  let cumulativeAngle = 0;
  const eps = 1 / (NUM_REF_SAMPLES - 1);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const t = s.t;

    const radius = evaluatePropCurve(config.radius, t);
    const elliptic = evaluatePropCurve(config.elliptic, t);
    const orientDeg = evaluatePropCurve(config.orientation, t);
    const freq = evaluatePropCurve(config.frequency, t);

    if (i > 0) {
      const prev = samples[i - 1]!;
      const ds = Math.sqrt(
        (s.x - prev.x) ** 2 + (s.y - prev.y) ** 2,
      );
      // Local curvature of radius curve (second derivative)
      const rPrev = evaluatePropCurve(config.radius, Math.max(0, t - eps));
      const rNext = evaluatePropCurve(config.radius, Math.min(1, t + eps));
      const accel = Math.abs(rNext - 2 * radius + rPrev);
      const curvatureBlend = maxAccel > 0 ? Math.min(1, accel / maxAccel) : 0;

      // Blend: 0 = no correction (linear), 1 = full correction (curved)
      const effectiveRadius = Math.max(radius, radiusFloor);
      const fullTravel = radiusMax > 0 ? radiusMax / effectiveRadius : 1;
      const travel = 1 + (fullTravel - 1) * curvatureBlend;
      cumulativeAngle += freq * ds * 0.05 * travel;
    }

    // Elliptic spiral in local tangent/normal frame, rotated by orientation
    const sinA = Math.sin(cumulativeAngle);
    const cosA = Math.cos(cumulativeAngle);

    // Local frame: tangent = cos axis, normal = sin axis; elliptic scales one axis
    let localT = radius * cosA;
    let localN = radius * elliptic * sinA;

    // Rotate by orientation angle
    const orientRad = (orientDeg * Math.PI) / 180;
    const cosO = Math.cos(orientRad);
    const sinO = Math.sin(orientRad);
    const rotT = localT * cosO - localN * sinO;
    const rotN = localT * sinO + localN * cosO;

    // Transform to world space
    points.push({
      x: s.x + rotT * s.nx + rotN * s.tx,
      y: s.y + rotT * s.ny + rotN * s.ty,
    });
  }

  return points;
}
