/**
 * Compute spine–spiral crossing analysis for the saved example.
 * A crossing happens every π radians of cumulative angle (half revolution).
 */

// ── Inline the relevant math (no Nuxt imports needed) ────────────────────────

interface Vec2 { x: number; y: number }
interface BezierNode { x: number; y: number; handleIn: Vec2; handleOut: Vec2 }
interface PropNode {
  t: number; value: number;
  handleIn: { dt: number; dv: number };
  handleOut: { dt: number; dv: number };
}
interface PropCurve { nodes: PropNode[]; min: number; max: number }

function cubicBezier1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const mu = 1 - u;
  return mu*mu*mu*p0 + 3*mu*mu*u*p1 + 3*mu*u*u*p2 + u*u*u*p3;
}

function evaluatePropCurve(curve: PropCurve, t: number): number {
  const nodes = curve.nodes;
  if (nodes.length === 0) return (curve.min + curve.max) / 2;
  if (nodes.length === 1) return nodes[0]!.value;
  if (t <= nodes[0]!.t) return nodes[0]!.value;
  if (t >= nodes[nodes.length - 1]!.t) return nodes[nodes.length - 1]!.value;

  let segIdx = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    if (t >= nodes[i]!.t && t <= nodes[i + 1]!.t) { segIdx = i; break; }
  }
  const a = nodes[segIdx]!;
  const b = nodes[segIdx + 1]!;

  const p0t = a.t, p1t = a.t + a.handleOut.dt, p2t = b.t + b.handleIn.dt, p3t = b.t;
  const p0v = a.value, p1v = a.value + a.handleOut.dv;
  const p2v = b.value + b.handleIn.dv, p3v = b.value;

  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const tMid = cubicBezier1D(p0t, p1t, p2t, p3t, mid);
    if (tMid < t) lo = mid; else hi = mid;
  }
  const u = (lo + hi) / 2;
  return cubicBezier1D(p0v, p1v, p2v, p3v, u);
}

function evalCubic(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1 - u;
  return {
    x: mu*mu*mu*a.x + 3*mu*mu*u*(a.x+a.handleOut.x) + 3*mu*u*u*(b.x+b.handleIn.x) + u*u*u*b.x,
    y: mu*mu*mu*a.y + 3*mu*mu*u*(a.y+a.handleOut.y) + 3*mu*u*u*(b.y+b.handleIn.y) + u*u*u*b.y,
  };
}

// ── Example data from the saved file ─────────────────────────────────────────

const nodes: BezierNode[] = [
  { x: 68.5, y: 69, handleIn: { x: -31.574, y: -24.558 }, handleOut: { x: 36, y: 28 } },
  { x: 245.5, y: 263, handleIn: { x: -58.41, y: -64.02 }, handleOut: { x: 58.41, y: 64.02 } },
];

const radiusCurve: PropCurve = {
  min: 0, max: 100,
  nodes: [
    { t: 0,     value: 0,      handleIn: { dt: -0.075, dv: -12.308 }, handleOut: { dt: 0.075, dv: 12.308 } },
    { t: 0.292, value: 64.530, handleIn: { dt: -0.234, dv: 0 },      handleOut: { dt: 0.096, dv: 0 } },
    { t: 0.413, value: 23.504, handleIn: { dt: 0, dv: 0 },           handleOut: { dt: 0.08, dv: 0 } },
    { t: 1,     value: 20,     handleIn: { dt: -0.15, dv: 0 },       handleOut: { dt: 0.15, dv: 0 } },
  ],
};

const FREQ = 29.996;

// ── Sample backbone path (arc-length parameterized) ──────────────────────────

const NUM_SAMPLES = 4000;
interface Sample { x: number; y: number; t: number; arcLen: number }

const samples: Sample[] = [];
let totalArc = 0;
const arcLengths: number[] = [];

for (let i = 0; i <= NUM_SAMPLES; i++) {
  const u = i / NUM_SAMPLES;
  const pos = evalCubic(nodes[0]!, nodes[1]!, u);
  if (i > 0) {
    const prev = samples[samples.length - 1]!;
    totalArc += Math.sqrt((pos.x - prev.x)**2 + (pos.y - prev.y)**2);
  }
  arcLengths.push(totalArc);
  samples.push({ x: pos.x, y: pos.y, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = totalArc > 0 ? s.arcLen / totalArc : 0;

console.log(`Total arc length: ${totalArc.toFixed(2)} px`);
console.log(`Samples: ${samples.length}`);
console.log();

// ── Print radius profile ────────────────────────────────────────────────────

console.log("=== Radius profile (sampled at 20 points) ===");
for (let i = 0; i <= 20; i++) {
  const t = i / 20;
  const r = evaluatePropCurve(radiusCurve, t);
  console.log(`  t=${t.toFixed(2)}  r=${r.toFixed(2)}`);
}
console.log();

// ── Helper: compute crossings for a given travel formula ─────────────────────

type TravelFn = (radius: number, radiusRef: number, radiusFloor: number, radiusMax: number, t: number) => number;

function computeCrossings(label: string, travelFn: TravelFn) {
  // Pre-compute reference values
  const REF_SAMPLES = 128;
  let rSum = 0, rMax = 0;
  for (let i = 0; i < REF_SAMPLES; i++) {
    const r = evaluatePropCurve(radiusCurve, i / (REF_SAMPLES - 1));
    rSum += r;
    if (r > rMax) rMax = r;
  }
  const rMean = rSum / REF_SAMPLES;
  const rRef = Math.max(rMean, rMax * 0.05);
  const rFloor = rMax * 0.05;

  let cumAngle = 0;
  const crossings: { arcLen: number; t: number; radius: number }[] = [];
  let nextCrossing = Math.PI; // first crossing at π (half revolution = 0→180°)

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    const prev = samples[i - 1]!;
    const ds = Math.sqrt((s.x - prev.x)**2 + (s.y - prev.y)**2);
    const radius = evaluatePropCurve(radiusCurve, s.t);
    const travel = travelFn(radius, rRef, rFloor, rMax, s.t);
    cumAngle += FREQ * ds * 0.05 * travel;

    while (cumAngle >= nextCrossing) {
      // Linearly interpolate the exact arc-length position
      const prevAngle = cumAngle - FREQ * ds * 0.05 * travel;
      const frac = (nextCrossing - prevAngle) / (cumAngle - prevAngle);
      const crossArc = prev.arcLen + frac * (s.arcLen - prev.arcLen);
      const crossT = crossArc / totalArc;
      const crossR = evaluatePropCurve(radiusCurve, crossT);
      crossings.push({ arcLen: crossArc, t: crossT, radius: crossR });
      nextCrossing += Math.PI;
    }
  }

  // Compute distances
  const distances: number[] = [];
  for (let i = 1; i < crossings.length; i++) {
    distances.push(crossings[i]!.arcLen - crossings[i - 1]!.arcLen);
  }

  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance = distances.reduce((a, d) => a + (d - mean)**2, 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0; // coefficient of variation
  const minD = Math.min(...distances);
  const maxD = Math.max(...distances);

  console.log(`=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}  (half-revolutions 0→180°)`);
  console.log(`  Distance stats: mean=${mean.toFixed(2)}  std=${stdDev.toFixed(2)}  CV=${(cv*100).toFixed(1)}%`);
  console.log(`  Range: min=${minD.toFixed(2)}  max=${maxD.toFixed(2)}  ratio=${(maxD/minD).toFixed(2)}`);
  console.log();

  // Print each crossing
  console.log("  #  | arc_len  |    t    | radius  | dist_to_prev");
  console.log("  ---|----------|---------|---------|-------------");
  for (let i = 0; i < crossings.length; i++) {
    const c = crossings[i]!;
    const dist = i > 0 ? (c.arcLen - crossings[i-1]!.arcLen).toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | ${c.arcLen.toFixed(2).padStart(8)} | ${c.t.toFixed(4).padStart(7)} | ${c.radius.toFixed(2).padStart(7)} | ${typeof dist === 'string' ? dist.padStart(12) : dist}`);
  }
  console.log();

  return { crossings, distances, mean, stdDev, cv };
}

// ── 1) No correction ────────────────────────────────────────────────────────

computeCrossings("NO CORRECTION (travel = 1)", () => 1);

// ── 2) Current code: mean-ref, strength 1.0 ────────────────────────────────

computeCrossings("CURRENT: mean-ref, strength=1.0", (r, rRef, rFloor) => {
  const eff = Math.max(r, rFloor);
  return rRef / eff;
});

// ── 3) Max-ref, strength 1.0 ───────────────────────────────────────────────

computeCrossings("MAX-REF: max-ref, strength=1.0", (r, _rRef, rFloor, rMax) => {
  const eff = Math.max(r, rFloor);
  return rMax / eff;
});

// ── 4) Strength 0.5 (sqrt blend) ───────────────────────────────────────────

computeCrossings("MEAN-REF, strength=0.5", (r, rRef, rFloor) => {
  const eff = Math.max(r, rFloor);
  return Math.pow(rRef / eff, 0.5);
});

// ── 5) Log-based correction ────────────────────────────────────────────────

computeCrossings("LOG-BASED: 1 + ln(rRef/r)", (r, rRef, rFloor) => {
  const eff = Math.max(r, rFloor);
  return 1 + Math.log(rRef / eff);
});

// ── 6) Hybrid: sqrt(r) correction ──────────────────────────────────────────

computeCrossings("SQRT: rRef^0.5 / r^0.5", (r, rRef, rFloor) => {
  const eff = Math.max(r, rFloor);
  return Math.sqrt(rRef / eff);
});
