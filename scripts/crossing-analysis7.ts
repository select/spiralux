/**
 * Experiment: Phase-aware angular rate correction.
 *
 * The tangent offset at crossing is ±r. When r changes, crossings shift.
 * We modulate ω within each half-revolution using sin(θ) * dr/ds:
 *
 *   ω_corrected = ω / (1 - k * sin(θ) * dr/ds)
 *
 * - When sin(θ)>0 and dr/ds>0 (approaching +r crossing, radius growing):
 *   denominator < 1 → ω increases → crossing happens sooner (at smaller s)
 *   → compensates for the growing tangent offset shifting it too far forward
 *
 * - When sin(θ)<0 and dr/ds>0 (approaching -r crossing, radius growing):
 *   denominator > 1 → ω decreases → crossing happens later (at larger s)
 *   → compensates for the growing offset shifting it too far backward
 *
 * Also test: dropping the tangent component entirely (normal-only spiral).
 */

interface Vec2 { x: number; y: number }
interface BezierNode { x: number; y: number; handleIn: Vec2; handleOut: Vec2 }
interface PropNode { t: number; value: number; handleIn: { dt: number; dv: number }; handleOut: { dt: number; dv: number } }
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
  const a = nodes[segIdx]!, b = nodes[segIdx + 1]!;
  const p0t = a.t, p1t = a.t + a.handleOut.dt, p2t = b.t + b.handleIn.dt, p3t = b.t;
  const p0v = a.value, p1v = a.value + a.handleOut.dv, p2v = b.value + b.handleIn.dv, p3v = b.value;
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    if (cubicBezier1D(p0t, p1t, p2t, p3t, mid) < t) lo = mid; else hi = mid;
  }
  return cubicBezier1D(p0v, p1v, p2v, p3v, (lo + hi) / 2);
}

function evalCubic(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1 - u;
  return {
    x: mu*mu*mu*a.x + 3*mu*mu*u*(a.x+a.handleOut.x) + 3*mu*u*u*(b.x+b.handleIn.x) + u*u*u*b.x,
    y: mu*mu*mu*a.y + 3*mu*mu*u*(a.y+a.handleOut.y) + 3*mu*u*u*(b.y+b.handleIn.y) + u*u*u*b.y,
  };
}

function evalCubicDeriv(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1 - u;
  const p0x = a.x, p1x = a.x+a.handleOut.x, p2x = b.x+b.handleIn.x, p3x = b.x;
  const p0y = a.y, p1y = a.y+a.handleOut.y, p2y = b.y+b.handleIn.y, p3y = b.y;
  return {
    x: 3*mu*mu*(p1x-p0x) + 6*mu*u*(p2x-p1x) + 3*u*u*(p3x-p2x),
    y: 3*mu*mu*(p1y-p0y) + 6*mu*u*(p2y-p1y) + 3*u*u*(p3y-p2y),
  };
}

const pathNodes: BezierNode[] = [
  { x: 68.5, y: 69, handleIn: { x: -31.574, y: -24.558 }, handleOut: { x: 36, y: 28 } },
  { x: 136.068, y: 140.166, handleIn: { x: -58.41, y: -64.02 }, handleOut: { x: 58.41, y: 64.02 } },
];
const radiusCurve: PropCurve = {
  min: 0, max: 100,
  nodes: [
    { t: 0,      value: 0,      handleIn: { dt: -0.075, dv: -12.308 }, handleOut: { dt: 0.075, dv: 12.308 } },
    { t: 0.5626, value: 52.564, handleIn: { dt: -0.234, dv: 0 },      handleOut: { dt: 0.096, dv: 0 } },
    { t: 0.7575, value: 20,     handleIn: { dt: 0, dv: 0 },           handleOut: { dt: 0, dv: 0 } },
    { t: 1,      value: 20,     handleIn: { dt: -0.15, dv: 0 },       handleOut: { dt: 0.15, dv: 0 } },
  ],
};
const FREQ = 29.996;

// ── Sample backbone ──────────────────────────────────────────────────────────

const N = 8000;
interface Sample { x: number; y: number; tx: number; ty: number; nx: number; ny: number; t: number; arcLen: number }
const samples: Sample[] = [];
let totalArc = 0;
for (let i = 0; i <= N; i++) {
  const u = i / N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  const d = evalCubicDeriv(pathNodes[0]!, pathNodes[1]!, u);
  const len = Math.sqrt(d.x*d.x + d.y*d.y) || 1;
  if (i > 0) {
    const prev = samples[samples.length-1]!;
    totalArc += Math.sqrt((pos.x-prev.x)**2 + (pos.y-prev.y)**2);
  }
  samples.push({ x: pos.x, y: pos.y, tx: d.x/len, ty: d.y/len, nx: -d.y/len, ny: d.x/len, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;

console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// Pre-compute dr/ds at each sample
function drds(t: number): number {
  const eps = 0.0005;
  const r0 = evaluatePropCurve(radiusCurve, Math.max(0, t - eps));
  const r1 = evaluatePropCurve(radiusCurve, Math.min(1, t + eps));
  // dr/dt → dr/ds = (dr/dt) * (dt/ds) but since t = arcLen/totalArc, dt/ds = 1/totalArc
  // So dr/ds = (r1-r0)/(2*eps) * (1/totalArc)... but we want dr per unit arc length
  // Actually: dr/ds = (dr/dt) / (ds/dt). For arc-length parameterized: ds/dt = totalArc
  // So dr/ds = (dr/dt) / totalArc = [(r1-r0)/(2*eps)] / totalArc
  return ((r1 - r0) / (2 * eps)) / totalArc;
}

// ── Analyze function ─────────────────────────────────────────────────────────

type GenFn = (s: Sample, cumAngle: number, radius: number, elliptic: number) => Vec2;
type AngleFn = (ds: number, freq: number, t: number, cumAngle: number, radius: number) => number;

function analyze(label: string, angleFn: AngleFn, genFn: GenFn) {
  let cumAngle = 0;
  const normalDisps: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const radius = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2 + (s.y-prev.y)**2);
      cumAngle += angleFn(ds, FREQ, s.t, cumAngle, radius);
    }
    const pt = genFn(s, cumAngle, radius, 1);
    const dx = pt.x - s.x, dy = pt.y - s.y;
    normalDisps.push(dx * s.nx + dy * s.ny);
  }

  interface Crossing { arcLen: number; t: number; radius: number; sign: number; spinePos: number }
  const crossings: Crossing[] = [];

  for (let i = 1; i < normalDisps.length; i++) {
    const d0 = normalDisps[i-1]!, d1 = normalDisps[i]!;
    if (d0 * d1 < 0) {
      const frac = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arcLen = s0.arcLen + frac * (s1.arcLen - s0.arcLen);
      const t = arcLen / totalArc;
      const r = evaluatePropCurve(radiusCurve, t);
      const sign = d1 > d0 ? 1 : -1;
      crossings.push({ arcLen, t, radius: r, sign, spinePos: arcLen + sign * r });
    }
  }

  const sameSide: number[] = [];
  for (let i = 2; i < crossings.length; i++) {
    sameSide.push(crossings[i]!.spinePos - crossings[i-2]!.spinePos);
  }

  if (sameSide.length === 0) { console.log(`=== ${label} === NO CROSSINGS\n`); return; }
  const mean = (a: number[]) => a.reduce((s,v)=>s+v,0)/a.length;
  const std = (a: number[]) => { const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };
  const m = mean(sameSide), s = std(sameSide);
  const mn = Math.min(...sameSide), mx = Math.max(...sameSide);

  console.log(`=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}  Same-side: mean=${m.toFixed(2)}  std=${s.toFixed(2)}  CV=${(s/Math.abs(m)*100).toFixed(1)}%  min=${mn.toFixed(2)}  max=${mx.toFixed(2)}`);

  // Show first 50 crossings
  for (let i = 0; i < Math.min(crossings.length, 50); i++) {
    const c = crossings[i]!;
    const ss = i >= 2 ? sameSide[i-2]!.toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | arc=${c.arcLen.toFixed(1).padStart(5)} sp=${c.spinePos.toFixed(1).padStart(7)} r=${c.radius.toFixed(1).padStart(5)} | Δss=${String(ss).padStart(7)}`);
  }
  console.log();
}

// Standard gen: normal + tangent
const stdGen: GenFn = (s, θ, r, e) => ({
  x: s.x + r*Math.cos(θ)*s.nx + r*e*Math.sin(θ)*s.tx,
  y: s.y + r*Math.cos(θ)*s.ny + r*e*Math.sin(θ)*s.ty,
});

// Normal-only gen: no tangent component
const normalOnlyGen: GenFn = (s, θ, r, _e) => ({
  x: s.x + r*Math.cos(θ)*s.nx,
  y: s.y + r*Math.cos(θ)*s.ny,
});

// Standard angle: no correction
const stdAngle: AngleFn = (ds, freq) => freq * ds * 0.05;

// ── 1) Baseline ──────────────────────────────────────────────────────────────

analyze("NO CORRECTION", stdAngle, stdGen);

// ── 2) Normal-only (no tangent component) ────────────────────────────────────

analyze("NORMAL-ONLY (no tangent)", stdAngle, normalOnlyGen);

// ── 3) Phase-aware: ω / (1 - k * sin(θ) * dr/ds) ───────────────────────────

for (const k of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]) {
  const angleFn: AngleFn = (ds, freq, t, cumAngle) => {
    const sinA = Math.sin(cumAngle);
    const drdsPt = drds(t);
    const correction = 1 - k * sinA * drdsPt;
    // Clamp to prevent sign reversal
    const clamped = Math.max(0.2, Math.min(5, correction));
    return freq * ds * 0.05 / clamped;
  };
  analyze(`PHASE-AWARE k=${k}`, angleFn, stdGen);
}

// ── 4) Two-pass: compute desired crossing positions, then adjust rate ────────

{
  // Pass 1: find crossings with no correction
  let cumAngle = 0;
  const nDisps: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const r = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2 + (s.y-prev.y)**2);
      cumAngle += FREQ * ds * 0.05;
    }
    nDisps.push(r * Math.cos(cumAngle));
  }

  const baseCrossings: { arcLen: number; sign: number; spinePos: number }[] = [];
  for (let i = 1; i < nDisps.length; i++) {
    if (nDisps[i-1]! * nDisps[i]! < 0) {
      const frac = Math.abs(nDisps[i-1]!) / (Math.abs(nDisps[i-1]!) + Math.abs(nDisps[i]!));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arc = s0.arcLen + frac*(s1.arcLen - s0.arcLen);
      const r = evaluatePropCurve(radiusCurve, arc/totalArc);
      const sign = nDisps[i]! > nDisps[i-1]! ? 1 : -1;
      baseCrossings.push({ arcLen: arc, sign, spinePos: arc + sign*r });
    }
  }

  // Compute current same-side spacing and desired uniform spacing
  if (baseCrossings.length >= 4) {
    // Separate sides
    const sideA = baseCrossings.filter((_,i) => i%2===0);
    const sideB = baseCrossings.filter((_,i) => i%2===1);

    for (const [name, side] of [["A", sideA], ["B", sideB]] as const) {
      const positions = (side as typeof sideA).map(c => c.spinePos);
      const totalSpan = positions[positions.length-1]! - positions[0]!;
      const uniformStep = totalSpan / (positions.length - 1);
      const diffs = [];
      for (let i = 1; i < positions.length; i++) diffs.push(positions[i]! - positions[i-1]!);
      const m = diffs.reduce((a,b)=>a+b,0)/diffs.length;
      const s = Math.sqrt(diffs.reduce((a,d)=>a+(d-m)**2,0)/diffs.length);
      console.log(`Side ${name}: ${positions.length} crossings, spine-pos step: mean=${m.toFixed(2)} std=${s.toFixed(2)} CV=${(s/Math.abs(m)*100).toFixed(1)}% uniform_step=${uniformStep.toFixed(2)}`);
    }
    console.log();
  }
}
