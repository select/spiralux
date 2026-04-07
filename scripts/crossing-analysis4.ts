/**
 * Compute SPINE-PROJECTED crossing distances.
 * 
 * When the spiral crosses the spine (normal component = 0), the crossing point
 * is displaced ALONG the tangent by ±r(s). So the projected position on the
 * spine line is: x_n = s_n + (-1)^n * r(s_n)
 *
 * This is what creates the visual non-uniformity the user sees.
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

// ── Data ─────────────────────────────────────────────────────────────────────

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
const arcLens: number[] = [];

for (let i = 0; i <= N; i++) {
  const u = i / N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  if (i > 0) {
    const prev = samples[samples.length-1]!;
    totalArc += Math.sqrt((pos.x-prev.x)**2 + (pos.y-prev.y)**2);
  }
  arcLens.push(totalArc);
  samples.push({ x: pos.x, y: pos.y, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;

console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// ── Find crossings and compute spine-projected positions ─────────────────────

type TravelFn = (radius: number, rRef: number, rFloor: number) => number;

function analyze(label: string, travelFn: TravelFn) {
  const REF = 128;
  let rSum = 0, rMax = 0;
  for (let i = 0; i < REF; i++) {
    const r = evaluatePropCurve(radiusCurve, i/(REF-1));
    rSum += r; if (r > rMax) rMax = r;
  }
  const rRef = Math.max(rSum/REF, rMax * 0.05);
  const rFloor = rMax * 0.05;

  // Track normal displacement = r * cos(θ)
  let cumAngle = 0;
  const normalDisps: number[] = [];
  const radii: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const radius = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2 + (s.y-prev.y)**2);
      cumAngle += FREQ * ds * 0.05 * travelFn(radius, rRef, rFloor);
    }
    normalDisps.push(radius * Math.cos(cumAngle));
    radii.push(radius);
  }

  // Find zero-crossings of normal displacement
  interface Crossing {
    arcLen: number; t: number; radius: number;
    sign: number; // +1 = going positive, -1 = going negative
    spinePos: number; // projected position along spine line
  }
  const crossings: Crossing[] = [];

  for (let i = 1; i < normalDisps.length; i++) {
    const d0 = normalDisps[i-1]!, d1 = normalDisps[i]!;
    if (d0 * d1 < 0) {
      const frac = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arcLen = s0.arcLen + frac * (s1.arcLen - s0.arcLen);
      const t = arcLen / totalArc;
      const r = evaluatePropCurve(radiusCurve, t);
      const sign = d1 > d0 ? 1 : -1; // direction of crossing

      // At crossing, θ = π/2 + nπ, so sin(θ) = ±1
      // Tangent offset = r * sin(θ) = ±r
      // Spine-projected position = arcLen + tangent_offset
      // The tangent offset sign alternates: +r, -r, +r, -r...
      const tangentSign = sign > 0 ? 1 : -1; // when going positive, sin = +1
      const spinePos = arcLen + tangentSign * r;

      crossings.push({ arcLen, t, radius: r, sign, spinePos });
    }
  }

  // Compute distances
  const spineDists: number[] = [];
  const sameSideDists: number[] = [];

  for (let i = 1; i < crossings.length; i++) {
    spineDists.push(crossings[i]!.spinePos - crossings[i-1]!.spinePos);
  }
  for (let i = 2; i < crossings.length; i++) {
    sameSideDists.push(crossings[i]!.spinePos - crossings[i-2]!.spinePos);
  }

  const mean = (arr: number[]) => arr.reduce((a,b)=>a+b,0)/arr.length;
  const std = (arr: number[]) => { const m = mean(arr); return Math.sqrt(arr.reduce((a,d)=>a+(d-m)**2,0)/arr.length); };
  const cv = (arr: number[]) => std(arr)/Math.abs(mean(arr));

  console.log(`\n=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}`);
  console.log(`  Consecutive spine-projected distances:`);
  console.log(`    mean=${mean(spineDists).toFixed(2)}  std=${std(spineDists).toFixed(2)}  CV=${(cv(spineDists)*100).toFixed(1)}%`);
  console.log(`    min=${Math.min(...spineDists).toFixed(2)}  max=${Math.max(...spineDists).toFixed(2)}`);
  console.log(`  Same-side (full revolution) distances:`);
  console.log(`    mean=${mean(sameSideDists).toFixed(2)}  std=${std(sameSideDists).toFixed(2)}  CV=${(cv(sameSideDists)*100).toFixed(1)}%`);
  console.log(`    min=${Math.min(...sameSideDists).toFixed(2)}  max=${Math.max(...sameSideDists).toFixed(2)}`);

  console.log(`\n  #  | arc_s  | spine_pos | radius | Δ spine | Δ same-side | side`);
  console.log(`  ---|--------|-----------|--------|---------|-------------|-----`);
  for (let i = 0; i < crossings.length; i++) {
    const c = crossings[i]!;
    const sd = i > 0 ? spineDists[i-1]!.toFixed(2) : "—";
    const ss = i >= 2 ? sameSideDists[i-2]!.toFixed(2) : "—";
    const side = c.sign > 0 ? "→+" : "→-";
    console.log(`  ${String(i+1).padStart(2)} | ${c.arcLen.toFixed(1).padStart(6)} | ${c.spinePos.toFixed(1).padStart(9)} | ${c.radius.toFixed(1).padStart(6)} | ${String(sd).padStart(7)} | ${String(ss).padStart(11)} | ${side}`);
  }
}

// ── Run analysis ─────────────────────────────────────────────────────────────

analyze("NO CORRECTION (current code)", () => 1);
