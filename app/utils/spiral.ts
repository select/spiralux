/**
 * Spiral rendering along a bezier backbone path.
 * Property curves control radius, elliptic distortion, orientation, frequency.
 */

import type { BezierNode, Vec2 } from "~/composables/useBezierStore";

/** Minimal node shape needed for bezier evaluation (no id required). */
type BezNode = Pick<BezierNode, 'x' | 'y' | 'handleIn' | 'handleOut'>;

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

// ── Deformation shape data model ─────────────────────────────────────────────

export interface DeformShapeNode {
  id: string;
  /** Normalized x coordinate (unit circle = 1) */
  x: number;
  /** Normalized y coordinate (unit circle = 1) */
  y: number;
  handleIn: { dx: number; dy: number };
  handleOut: { dx: number; dy: number };
}

export interface DeformPoint {
  id: string;
  /** 0–1 position along the backbone path */
  t: number;
  /** Closed bezier shape nodes */
  nodes: DeformShapeNode[];
}

/** Bezier circle approximation constant: 4/3 * (√2 − 1) */
const KAPPA = 0.5522847498;

/**
 * Create a closed bezier shape matching the spiral cross-section at a given t.
 * Applies elliptic ratio and orientation from the property curves so the
 * initial deformation shape reflects the current spiral parameters.
 */
export function makeDeformShape(config: BezierSpiralConfig, t: number): DeformShapeNode[] {
  const elliptic = evaluatePropCurve(config.elliptic, t);
  const orientDeg = evaluatePropCurve(config.orientation, t);
  const orientRad = (orientDeg * Math.PI) / 180;
  const cosO = Math.cos(orientRad);
  const sinO = Math.sin(orientRad);

  // Unit circle nodes before transformation
  const raw: { x: number; y: number; hix: number; hiy: number; hox: number; hoy: number }[] = [
    { x: 1, y: 0, hix: 0, hiy: -KAPPA, hox: 0, hoy: KAPPA },
    { x: 0, y: 1, hix: KAPPA, hiy: 0, hox: -KAPPA, hoy: 0 },
    { x: -1, y: 0, hix: 0, hiy: KAPPA, hox: 0, hoy: -KAPPA },
    { x: 0, y: -1, hix: -KAPPA, hiy: 0, hox: KAPPA, hoy: 0 },
  ];

  // Apply elliptic stretch (scale y axis) then rotate by orientation
  function transform(px: number, py: number): { x: number; y: number } {
    const sy = py * elliptic;
    return { x: px * cosO - sy * sinO, y: px * sinO + sy * cosO };
  }

  return raw.map(n => {
    const pos = transform(n.x, n.y);
    const hiAbs = transform(n.x + n.hix, n.y + n.hiy);
    const hoAbs = transform(n.x + n.hox, n.y + n.hoy);
    return {
      id: propUid(),
      x: pos.x,
      y: pos.y,
      handleIn: { dx: hiAbs.x - pos.x, dy: hiAbs.y - pos.y },
      handleOut: { dx: hoAbs.x - pos.x, dy: hoAbs.y - pos.y },
    };
  });
}

export function makeDeformPoint(config: BezierSpiralConfig, t: number): DeformPoint {
  return { id: propUid(), t, nodes: makeDeformShape(config, t) };
}

// ── Preset deformation shapes ────────────────────────────────────────────────

/** Helper: create a DeformShapeNode from absolute position + absolute handle positions */
function shapeNode(x: number, y: number, hix: number, hiy: number, hox: number, hoy: number): DeformShapeNode {
  return { id: propUid(), x, y, handleIn: { dx: hix - x, dy: hiy - y }, handleOut: { dx: hox - x, dy: hoy - y } };
}

/** Helper: create smooth node on a polar curve at angle θ with smooth bezier handles */
function polarNode(angleFn: (a: number) => number, theta: number, total: number): DeformShapeNode {
  const r = angleFn(theta);
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);

  // Tangent approximation via small angular step
  const dt = (2 * Math.PI / total) * KAPPA;
  const rPrev = angleFn(theta - dt);
  const rNext = angleFn(theta + dt);
  const hix = rPrev * Math.cos(theta - dt);
  const hiy = rPrev * Math.sin(theta - dt);
  const hox = rNext * Math.cos(theta + dt);
  const hoy = rNext * Math.sin(theta + dt);

  return shapeNode(x, y, hix, hiy, hox, hoy);
}

/** Ellipse preset: ratio + orientation angle */
export function presetEllipse(ratio: number, orientDeg: number): DeformShapeNode[] {
  const orientRad = (orientDeg * Math.PI) / 180;
  const cosO = Math.cos(orientRad);
  const sinO = Math.sin(orientRad);
  const raw = [
    { x: 1, y: 0, hix: 0, hiy: -KAPPA, hox: 0, hoy: KAPPA },
    { x: 0, y: 1, hix: KAPPA, hiy: 0, hox: -KAPPA, hoy: 0 },
    { x: -1, y: 0, hix: 0, hiy: KAPPA, hox: 0, hoy: -KAPPA },
    { x: 0, y: -1, hix: -KAPPA, hiy: 0, hox: KAPPA, hoy: 0 },
  ];
  function transform(px: number, py: number): { x: number; y: number } {
    const sy = py * ratio;
    return { x: px * cosO - sy * sinO, y: px * sinO + sy * cosO };
  }
  return raw.map(nd => {
    const pos = transform(nd.x, nd.y);
    const hiAbs = transform(nd.x + nd.hix, nd.y + nd.hiy);
    const hoAbs = transform(nd.x + nd.hox, nd.y + nd.hoy);
    return shapeNode(pos.x, pos.y, hiAbs.x, hiAbs.y, hoAbs.x, hoAbs.y);
  });
}

/** Sine wave preset: frequency bumps around circle + amplitude */
export function presetSine(freq: number, amplitude: number, phaseDeg: number): DeformShapeNode[] {
  const phaseRad = (phaseDeg * Math.PI) / 180;
  const count = Math.max(Math.round(freq) * 4, 12);
  const rFn = (a: number) => 1 + amplitude * Math.sin(freq * a + phaseRad);
  const nodes: DeformShapeNode[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    nodes.push(polarNode(rFn, theta, count));
  }
  return nodes;
}

/** Star preset: N points with depth (0 = circle, 1 = points touch center) */
export function presetStar(points: number, depth: number): DeformShapeNode[] {
  const count = points * 2;
  const innerR = 1 - depth;
  const rFn = (a: number) => {
    let na = a % (2 * Math.PI);
    if (na < 0) na += 2 * Math.PI;
    const sector = (na / (2 * Math.PI)) * count;
    const frac = sector - Math.floor(sector);
    const isOuter = Math.floor(sector) % 2 === 0;
    if (isOuter) return 1 - frac * (1 - innerR);
    return innerR + frac * (1 - innerR);
  };
  const nodes: DeformShapeNode[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    nodes.push(polarNode(rFn, theta, count));
  }
  return nodes;
}

/** Polygon preset: N sides with corner rounding (0 = sharp, 1 = circle) */
export function presetPolygon(sides: number, rounding: number): DeformShapeNode[] {
  const nodesPerSide = 2;
  const total = sides * nodesPerSide;
  const result: DeformShapeNode[] = [];

  for (let i = 0; i < sides; i++) {
    const a0 = (2 * Math.PI * i) / sides - Math.PI / 2;
    const a1 = (2 * Math.PI * (i + 1)) / sides - Math.PI / 2;
    const amid = (a0 + a1) / 2;

    const edgeMidR = Math.cos(Math.PI / sides);
    const midR = edgeMidR + rounding * (1 - edgeMidR);

    const vx = Math.cos(a0);
    const vy = Math.sin(a0);
    const handleLen = (2 * Math.PI / total) * KAPPA * rounding;
    const hiAngle = a0 - Math.PI / 2;
    const hoAngle = a0 + Math.PI / 2;
    result.push(shapeNode(
      vx, vy,
      vx + handleLen * Math.cos(hiAngle), vy + handleLen * Math.sin(hiAngle),
      vx + handleLen * Math.cos(hoAngle), vy + handleLen * Math.sin(hoAngle),
    ));

    const mx = midR * Math.cos(amid);
    const my = midR * Math.sin(amid);
    const mhiAngle = amid - Math.PI / 2;
    const mhoAngle = amid + Math.PI / 2;
    const mHandleLen = (2 * Math.PI / total) * KAPPA;
    result.push(shapeNode(
      mx, my,
      mx + mHandleLen * Math.cos(mhiAngle), my + mHandleLen * Math.sin(mhiAngle),
      mx + mHandleLen * Math.cos(mhoAngle), my + mHandleLen * Math.sin(mhoAngle),
    ));
  }
  return result;
}

/** Rose curve preset: petals + depth */
export function presetRose(petals: number, depth: number): DeformShapeNode[] {
  const count = Math.max(petals * 4, 12);
  const rFn = (a: number) => 1 + depth * Math.cos(petals * a);
  const nodes: DeformShapeNode[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    nodes.push(polarNode(rFn, theta, count));
  }
  return nodes;
}

/** Superellipse preset: exponent (2=ellipse, <2=star-ish, >2=squarish) + ratio */
export function presetSuperellipse(exponent: number, ratio: number): DeformShapeNode[] {
  const count = 32;
  const nodes: DeformShapeNode[] = [];
  const rFn = (a: number) => {
    const absCos = Math.abs(Math.cos(a));
    const absSin = Math.abs(Math.sin(a));
    if (absCos < 1e-10) return ratio;
    if (absSin < 1e-10) return 1;
    const term = Math.pow(absCos, exponent) + Math.pow(absSin / ratio, exponent);
    return Math.pow(1 / term, 1 / exponent);
  };
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    nodes.push(polarNode(rFn, theta, count));
  }
  return nodes;
}

export interface BezierSpiralConfig {
  enabled: boolean;
  /** Stroke width in millimetres */
  lineWidth: number;
  radius: PropCurve;
  elliptic: PropCurve;
  orientation: PropCurve;
  frequency: PropCurve;
  /** Deformation points along the path — closed bezier shapes */
  deformation: DeformPoint[];
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
  // Build config without deformation first, then create deformation points
  // that reference the config for initial shape computation.
  const cfg: BezierSpiralConfig = {
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
    deformation: [],
  };
  cfg.deformation = [makeDeformPoint(cfg, 0), makeDeformPoint(cfg, 1)];
  return cfg;
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

function evalCubic(a: BezNode, b: BezNode, u: number): Vec2 {
  const mu = 1 - u;
  return {
    x: mu * mu * mu * a.x + 3 * mu * mu * u * (a.x + a.handleOut.x) + 3 * mu * u * u * (b.x + b.handleIn.x) + u * u * u * b.x,
    y: mu * mu * mu * a.y + 3 * mu * mu * u * (a.y + a.handleOut.y) + 3 * mu * u * u * (b.y + b.handleIn.y) + u * u * u * b.y,
  };
}

function evalCubicDerivative(a: BezNode, b: BezNode, u: number): Vec2 {
  const mu = 1 - u;
  const p0x = a.x, p1x = a.x + a.handleOut.x, p2x = b.x + b.handleIn.x, p3x = b.x;
  const p0y = a.y, p1y = a.y + a.handleOut.y, p2y = b.y + b.handleIn.y, p3y = b.y;
  return {
    x: 3 * mu * mu * (p1x - p0x) + 6 * mu * u * (p2x - p1x) + 3 * u * u * (p3x - p2x),
    y: 3 * mu * mu * (p1y - p0y) + 6 * mu * u * (p2y - p1y) + 3 * u * u * (p3y - p2y),
  };
}

export function sampleBezierPath(
  nodes: BezNode[],
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

// ── Deformation shape sampling ───────────────────────────────────────────────

/** Evaluate cubic bezier at parameter t */
function cubicBez(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
}

/**
 * Sample a point on a closed bezier shape at a given angle (radians).
 * The shape's natural parameter [0..1) maps linearly to [0..2π).
 * Node 0 is at angle 0 (≈ "3 o'clock" on the default circle).
 */
function sampleDeformShape(nodes: DeformShapeNode[], angle: number): { x: number; y: number } {
  const n = nodes.length;
  if (n < 2) return { x: Math.cos(angle), y: Math.sin(angle) };

  // Normalize angle to [0, 2π)
  const TWO_PI = 2 * Math.PI;
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;

  const u = a / TWO_PI;           // [0..1)
  const segF = u * n;
  const seg = Math.floor(segF) % n;
  const lt = segF - Math.floor(segF); // local t within segment

  const p0 = nodes[seg]!;
  const p1 = nodes[(seg + 1) % n]!;

  return {
    x: cubicBez(p0.x, p0.x + p0.handleOut.dx, p1.x + p1.handleIn.dx, p1.x, lt),
    y: cubicBez(p0.y, p0.y + p0.handleOut.dy, p1.y + p1.handleIn.dy, p1.y, lt),
  };
}

/**
 * Sample the deformation cross-section at backbone position `t` and spiral
 * angle `angle`.  Finds the two bracketing DeformPoints, samples each shape
 * independently at the angle, then linearly interpolates the resulting 2-D
 * points.  Works regardless of whether the two shapes have the same number
 * of nodes.
 *
 * Returns null when deformation is empty / undefined (caller should fall
 * back to legacy elliptic + orientation).
 */
function sampleDeformAtT(
  deformation: DeformPoint[] | undefined,
  t: number,
  angle: number,
): { x: number; y: number } | null {
  if (!deformation || deformation.length === 0) return null;

  if (deformation.length === 1) {
    return sampleDeformShape(deformation[0]!.nodes, angle);
  }

  // Clamp to first / last
  if (t <= deformation[0]!.t) {
    return sampleDeformShape(deformation[0]!.nodes, angle);
  }
  const last = deformation[deformation.length - 1]!;
  if (t >= last.t) {
    return sampleDeformShape(last.nodes, angle);
  }

  // Find bracketing pair
  for (let i = 0; i < deformation.length - 1; i++) {
    const a = deformation[i]!;
    const b = deformation[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const blend = span > 0 ? (t - a.t) / span : 0;
      const pa = sampleDeformShape(a.nodes, angle);
      const pb = sampleDeformShape(b.nodes, angle);
      const m = 1 - blend;
      return { x: pa.x * m + pb.x * blend, y: pa.y * m + pb.y * blend };
    }
  }
  return sampleDeformShape(last.nodes, angle);
}

// ── Spiral generation ────────────────────────────────────────────────────────

export function generateSpiralPoints(
  samples: PathSample[],
  config: BezierSpiralConfig,
): Vec2[] {
  if (samples.length < 2 || !config.enabled) return [];

  const points: Vec2[] = [];
  let cumulativeAngle = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const t = s.t;

    const radius = evaluatePropCurve(config.radius, t);
    const freq = evaluatePropCurve(config.frequency, t);

    if (i > 0) {
      const prev = samples[i - 1]!;
      const ds = Math.sqrt(
        (s.x - prev.x) ** 2 + (s.y - prev.y) ** 2,
      );
      cumulativeAngle += freq * ds * 0.05;
    }

    const deformPt = sampleDeformAtT(config.deformation, t, cumulativeAngle);
    const rotT = radius * (deformPt?.x ?? Math.cos(cumulativeAngle));
    const rotN = radius * (deformPt?.y ?? Math.sin(cumulativeAngle));

    // Transform to world space
    points.push({
      x: s.x + rotT * s.nx + rotN * s.tx,
      y: s.y + rotT * s.ny + rotN * s.ty,
    });
  }

  return points;
}

// ── Crossing correction experiments (notes for future work) ──────────────────
//
// Problem: with circular coils and varying radius, the spiral crosses the
// spine at positions s ± r (tangent offset). When r varies, visible
// same-side (360°) crossing distances become non-uniform.
//
// Key findings from experiments (scripts/crossing-*.ts):
//
// 1. ARC-LENGTH spacing between crossings is already perfectly uniform
//    (CV=0%) with no correction. The visible non-uniformity comes purely
//    from the ±r tangent offset at each crossing point.
//
// 2. Angular rate corrections tested (1/r, dr/ds, phase-aware sin(θ)*dr/ds)
//    all made same-side uniformity WORSE because the tangent offset
//    dominates and can't be cancelled by smooth ω modulation — the
//    per-sample sinusoidal correction creates feedback oscillations.
//
// 3. Reducing the tangent component (TANGENT_SCALE < 1 on localN) gives
//    near-perfect crossing uniformity (CV=11% at scale=0.1) but changes
//    circles to ellipses — rejected for visual reasons.
//
// 4. Two-pass iterative correction (scripts/crossing-oneside.ts) works
//    mathematically: side-A crossings converge to uniform 4.19 spacing
//    (crossings 1–27 all perfect). But the non-uniform angular rate
//    produces a visual result that doesn't look good.
//
// 5. Spine-position compensation (shifting backbone by -r·sinθ) fixes
//    crossings analytically but causes foldback artifacts when r is
//    large relative to path length.
//
// 6. Only ONE side needs uniform advance — odd crossings can be irregular.
//    Same-side = full 360° revolution distance.
//
// Conclusion: with true circular coils, the ±r tangent offset is an
// inherent geometric property. The current no-correction approach gives
// the cleanest visual result. Future ideas to explore:
//   - Per-coil arc segments (define crossings first, fit arcs between)
//   - 3D helix projection onto 2D (different parameterization)
//   - User-adjustable tangent scale via UI (separate from elliptic)
//   - Frequency-adaptive: auto-increase freq where dr/ds is large
