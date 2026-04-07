/**
 * Predictive crossing correction.
 *
 * At each sample, predict where the next same-side crossing (360° ahead)
 * will land on the spine line, and adjust angular rate to place it correctly.
 *
 * For a circular coil at spine arc-position s with angle θ:
 *   crossing spine-line position = s + sign * r(s)
 *   next same-side crossing at s': p' = s' + sign * r(s')
 *   same-side distance: p' - p = (s'-s) + sign*(r(s') - r(s))
 *                               = 2Δs + sign * Δr
 *
 * To make same-side distance = D:
 *   2Δs = D - sign * Δr
 *   Approximate Δr ≈ (dr/ds) * 2Δs:
 *   2Δs * (1 + sign * dr/ds) = D
 *   travel = ω_corrected/ω_base = 1 + sign * dr/ds
 *
 * Since sign = sin(θ) at crossing, use sin(θ) as continuous weight:
 *   travel = 1 + sin(cumAngle) * dr/ds
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

const N = 8000;
interface Sample { x: number; y: number; tx: number; ty: number; nx: number; ny: number; t: number; arcLen: number }
const samples: Sample[] = [];
let totalArc = 0;
for (let i = 0; i <= N; i++) {
  const u = i / N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  const d = evalCubicDeriv(pathNodes[0]!, pathNodes[1]!, u);
  const len = Math.sqrt(d.x*d.x + d.y*d.y) || 1;
  if (i > 0) { const p = samples[samples.length-1]!; totalArc += Math.sqrt((pos.x-p.x)**2+(pos.y-p.y)**2); }
  samples.push({ x: pos.x, y: pos.y, tx: d.x/len, ty: d.y/len, nx: -d.y/len, ny: d.x/len, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;
console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// dr/ds at parameter t
function drdsAt(t: number): number {
  const eps = 0.001;
  const r0 = evaluatePropCurve(radiusCurve, Math.max(0, t - eps));
  const r1 = evaluatePropCurve(radiusCurve, Math.min(1, t + eps));
  return ((r1 - r0) / (2 * eps)) / totalArc; // per unit arc length
}

// ── Analyze with proper geometric projection ─────────────────────────────────

type AngleFn = (ds: number, freq: number, t: number, cumAngle: number, radius: number) => number;

function analyze(label: string, angleFn: AngleFn) {
  let cumAngle = 0;
  const spiralPts: Vec2[] = [];
  const normalDisps: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const r = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2+(s.y-prev.y)**2);
      cumAngle += angleFn(ds, FREQ, s.t, cumAngle, r);
    }
    const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
    const px = s.x + r*cosA*s.nx + r*sinA*s.tx;
    const py = s.y + r*cosA*s.ny + r*sinA*s.ty;
    spiralPts.push({ x: px, y: py });
    normalDisps.push((px-s.x)*s.nx + (py-s.y)*s.ny);
  }

  // Geometric crossing detection + spine projection
  interface Crossing { arcLen: number; spinePos: number; radius: number }
  const crossings: Crossing[] = [];
  for (let i = 1; i < normalDisps.length; i++) {
    if (normalDisps[i-1]! * normalDisps[i]! < 0) {
      const frac = Math.abs(normalDisps[i-1]!) / (Math.abs(normalDisps[i-1]!) + Math.abs(normalDisps[i]!));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arc = s0.arcLen + frac*(s1.arcLen-s0.arcLen);
      const r = evaluatePropCurve(radiusCurve, arc/totalArc);
      const p0 = spiralPts[i-1]!, p1 = spiralPts[i]!;
      const cx = p0.x+frac*(p1.x-p0.x), cy = p0.y+frac*(p1.y-p0.y);
      const sx = s0.x+frac*(s1.x-s0.x), sy = s0.y+frac*(s1.y-s0.y);
      const stx = s0.tx+frac*(s1.tx-s0.tx), sty = s0.ty+frac*(s1.ty-s0.ty);
      const proj = (cx-sx)*stx + (cy-sy)*sty;
      crossings.push({ arcLen: arc, spinePos: arc+proj, radius: r });
    }
  }

  // Same-side distances (every other crossing = full 360° revolution)
  const sameSide: number[] = [];
  for (let i = 2; i < crossings.length; i++) sameSide.push(crossings[i]!.spinePos - crossings[i-2]!.spinePos);

  if (sameSide.length === 0) { console.log(`=== ${label} === NO DATA\n`); return; }
  const mean = (a: number[]) => a.reduce((s,v)=>s+v,0)/a.length;
  const std = (a: number[]) => { const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };
  const m = mean(sameSide), s = std(sameSide);
  console.log(`=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}  Same-side(360°): mean=${m.toFixed(2)} std=${s.toFixed(2)} CV=${(s/Math.abs(m)*100).toFixed(1)}% min=${Math.min(...sameSide).toFixed(2)} max=${Math.max(...sameSide).toFixed(2)}`);
  for (let i = 0; i < crossings.length; i++) {
    const c = crossings[i]!;
    const ss = i >= 2 ? sameSide[i-2]!.toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | arc=${c.arcLen.toFixed(1).padStart(5)} sp=${c.spinePos.toFixed(1).padStart(7)} r=${c.radius.toFixed(1).padStart(5)} | Δ360=${String(ss).padStart(7)}`);
  }
  console.log();
}

// ── 1) Baseline ──────────────────────────────────────────────────────────────
analyze("BASELINE (no correction)", (ds, freq) => freq * ds * 0.05);

// ── 2) Predictive: travel = 1 + sin(θ) * dr/ds ──────────────────────────────
// Derived from: to keep same-side spacing D constant,
// the angular rate must account for the radius slope.

for (const gain of [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]) {
  analyze(`PREDICTIVE gain=${gain}`, (ds, freq, t, cumAngle) => {
    const sinA = Math.sin(cumAngle);
    const slope = drdsAt(t);
    const travel = 1 + gain * sinA * slope;
    // Clamp to prevent reversal
    const clamped = Math.max(0.1, Math.min(4, travel));
    return freq * ds * 0.05 * clamped;
  });
}

// ── 3) Predictive with squared sin (smoother) ───────────────────────────────
for (const gain of [1.0, 1.5, 2.0]) {
  analyze(`PRED-SMOOTH gain=${gain}`, (ds, freq, t, cumAngle) => {
    const sinA = Math.sin(cumAngle);
    // sign-preserving square: sin * |sin| keeps sign but peaks at ±1
    const slope = drdsAt(t);
    const travel = 1 + gain * sinA * slope;
    return freq * ds * 0.05 * Math.max(0.1, Math.min(4, travel));
  });
}
