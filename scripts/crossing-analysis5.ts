/**
 * Test dr/ds-based angular rate correction to equalize same-side crossing distances.
 *
 * Physics: crossing position on spine = s ± r(s). Same-side spacing = 2Δs ± Δr.
 * To compensate: adjust angular rate based on local dr/ds so that the spine-projected
 * crossing positions advance uniformly.
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
interface Sample { x: number; y: number; t: number; arcLen: number }
const samples: Sample[] = [];
let totalArc = 0;
for (let i = 0; i <= N; i++) {
  const u = i / N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  if (i > 0) {
    const prev = samples[samples.length-1]!;
    totalArc += Math.sqrt((pos.x-prev.x)**2 + (pos.y-prev.y)**2);
  }
  samples.push({ x: pos.x, y: pos.y, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;

console.log(`Total arc length: ${totalArc.toFixed(2)} px`);

// ── Pre-compute dr/dt for the radius curve ───────────────────────────────────

function drdt(t: number): number {
  const eps = 0.001;
  const r0 = evaluatePropCurve(radiusCurve, Math.max(0, t - eps));
  const r1 = evaluatePropCurve(radiusCurve, Math.min(1, t + eps));
  return (r1 - r0) / (2 * eps); // dr/dt
}

// ── Analyze function ─────────────────────────────────────────────────────────

type TravelFn = (t: number, radius: number) => number;

function analyze(label: string, travelFn: TravelFn) {
  let cumAngle = 0;
  const normalDisps: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const radius = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2 + (s.y-prev.y)**2);
      cumAngle += FREQ * ds * 0.05 * travelFn(s.t, radius);
    }
    normalDisps.push(radius * Math.cos(cumAngle));
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
      const tangentSign = sign > 0 ? 1 : -1;
      crossings.push({ arcLen, t, radius: r, sign, spinePos: arcLen + tangentSign * r });
    }
  }

  const sameSideDists: number[] = [];
  for (let i = 2; i < crossings.length; i++) {
    sameSideDists.push(crossings[i]!.spinePos - crossings[i-2]!.spinePos);
  }

  const mean = (a: number[]) => a.reduce((s,v)=>s+v,0)/a.length;
  const std = (a: number[]) => { const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };

  const m = mean(sameSideDists), s = std(sameSideDists);
  const mn = Math.min(...sameSideDists), mx = Math.max(...sameSideDists);

  console.log(`\n=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}  Same-side: mean=${m.toFixed(2)}  std=${s.toFixed(2)}  CV=${(s/Math.abs(m)*100).toFixed(1)}%  min=${mn.toFixed(2)}  max=${mx.toFixed(2)}`);

  console.log(`  #  | arc_s | spine_pos | radius | Δ same-side`);
  console.log(`  ---|-------|-----------|--------|------------`);
  for (let i = 0; i < crossings.length; i++) {
    const c = crossings[i]!;
    const ss = i >= 2 ? sameSideDists[i-2]!.toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | ${c.arcLen.toFixed(1).padStart(5)} | ${c.spinePos.toFixed(1).padStart(9)} | ${c.radius.toFixed(1).padStart(6)} | ${String(ss).padStart(11)}`);
  }
}

// ── 1) No correction ────────────────────────────────────────────────────────

analyze("NO CORRECTION", () => 1);

// ── 2) dr/ds compensation: speed up where radius increases ──────────────────
// The idea: when radius grows (dr/dt > 0), the "→+" crossings advance faster
// and "→-" crossings lag. To compensate, speed up angular rate when dr/dt > 0
// so that the arc-length step shrinks, reducing the radius change per revolution.

for (const k of [0.005, 0.01, 0.015, 0.02, 0.025, 0.03]) {
  analyze(`dr/ds compensation k=${k}`, (t) => {
    const drd = drdt(t); // dr/dt (per unit t)
    // Convert to dr/ds: dr/ds = (dr/dt) / totalArc (since t = s/totalArc)
    const drds = drd / totalArc;
    // Speed up angular rate proportional to |dr/ds|
    // When radius grows fast, we need more revolutions per unit arc
    return 1 / (1 - k * drd);
  });
}

// ── 3) Phase-aware correction ────────────────────────────────────────────────
// Track cumulative angle and adjust differently based on which half of the
// revolution we're in (approaching +crossing vs -crossing)

analyze("Phase-aware correction", (t, radius) => {
  const drd = drdt(t);
  // Use sin(cumAngle) to determine phase — but we don't have cumAngle here easily
  // Approximate: travel = 1 + k * sin(θ) * dr/ds
  // This requires tracking phase... let's try a simpler approach
  const drds = drd / totalArc;
  return 1 / (1 - 0.02 * drd);
});
