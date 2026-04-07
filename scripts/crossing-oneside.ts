/**
 * ONE-SIDE correction: only make side A crossings (every 360°) uniform.
 * 
 * Side A crossings happen at arc positions s_0, s_2, s_4, ...
 * Their spine-line positions are p_n = s_n + r(s_n) (all same sign).
 * 
 * Strategy: adjust angular rate so that the arc step between same-side
 * crossings produces uniform spine-line advance.
 * 
 * Between side A crossing n and n+1 (arc distance = 2 half-revolutions):
 *   spine advance = 2*Δs + (r(s_{n+1}) - r(s_n))
 * 
 * Want spine advance = D (target).
 * So: 2*Δs_needed = D - Δr
 *     ω_needed = 2π / (2*Δs_needed) = π / Δs_needed
 *     travel = ω_needed / ω_base
 */

interface Vec2 { x: number; y: number }
interface BezierNode { x: number; y: number; handleIn: Vec2; handleOut: Vec2 }
interface PropNode { t: number; value: number; handleIn: { dt: number; dv: number }; handleOut: { dt: number; dv: number } }
interface PropCurve { nodes: PropNode[]; min: number; max: number }

function cubicBezier1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const mu = 1-u; return mu*mu*mu*p0+3*mu*mu*u*p1+3*mu*u*u*p2+u*u*u*p3;
}
function evaluatePropCurve(curve: PropCurve, t: number): number {
  const nodes = curve.nodes;
  if (nodes.length <= 1) return nodes.length === 1 ? nodes[0]!.value : (curve.min+curve.max)/2;
  if (t <= nodes[0]!.t) return nodes[0]!.value;
  if (t >= nodes[nodes.length-1]!.t) return nodes[nodes.length-1]!.value;
  let segIdx = 0;
  for (let i = 0; i < nodes.length-1; i++) { if (t >= nodes[i]!.t && t <= nodes[i+1]!.t) { segIdx = i; break; } }
  const a = nodes[segIdx]!, b = nodes[segIdx+1]!;
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) { const mid = (lo+hi)/2; if (cubicBezier1D(a.t, a.t+a.handleOut.dt, b.t+b.handleIn.dt, b.t, mid) < t) lo = mid; else hi = mid; }
  return cubicBezier1D(a.value, a.value+a.handleOut.dv, b.value+b.handleIn.dv, b.value, (lo+hi)/2);
}
function evalCubic(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1-u;
  return { x: mu*mu*mu*a.x+3*mu*mu*u*(a.x+a.handleOut.x)+3*mu*u*u*(b.x+b.handleIn.x)+u*u*u*b.x,
           y: mu*mu*mu*a.y+3*mu*mu*u*(a.y+a.handleOut.y)+3*mu*u*u*(b.y+b.handleIn.y)+u*u*u*b.y };
}
function evalCubicDeriv(a: BezierNode, b: BezierNode, u: number): Vec2 {
  const mu = 1-u;
  return { x: 3*mu*mu*((a.x+a.handleOut.x)-a.x)+6*mu*u*((b.x+b.handleIn.x)-(a.x+a.handleOut.x))+3*u*u*(b.x-(b.x+b.handleIn.x)),
           y: 3*mu*mu*((a.y+a.handleOut.y)-a.y)+6*mu*u*((b.y+b.handleIn.y)-(a.y+a.handleOut.y))+3*u*u*(b.y-(b.y+b.handleIn.y)) };
}

const pathNodes: BezierNode[] = [
  { x: 68.5, y: 69, handleIn: { x: -31.574, y: -24.558 }, handleOut: { x: 36, y: 28 } },
  { x: 136.068, y: 140.166, handleIn: { x: -58.41, y: -64.02 }, handleOut: { x: 58.41, y: 64.02 } },
];
const radiusCurve: PropCurve = {
  min: 0, max: 100,
  nodes: [
    { t: 0, value: 0, handleIn: { dt: -0.075, dv: -12.308 }, handleOut: { dt: 0.075, dv: 12.308 } },
    { t: 0.5626, value: 52.564, handleIn: { dt: -0.234, dv: 0 }, handleOut: { dt: 0.096, dv: 0 } },
    { t: 0.7575, value: 20, handleIn: { dt: 0, dv: 0 }, handleOut: { dt: 0, dv: 0 } },
    { t: 1, value: 20, handleIn: { dt: -0.15, dv: 0 }, handleOut: { dt: 0.15, dv: 0 } },
  ],
};
const FREQ = 29.996;

const N = 8000;
interface Sample { x: number; y: number; tx: number; ty: number; nx: number; ny: number; t: number; arcLen: number }
const samples: Sample[] = [];
let totalArc = 0;
for (let i = 0; i <= N; i++) {
  const u = i/N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  const d = evalCubicDeriv(pathNodes[0]!, pathNodes[1]!, u);
  const len = Math.sqrt(d.x*d.x+d.y*d.y)||1;
  if (i > 0) { const p = samples[samples.length-1]!; totalArc += Math.sqrt((pos.x-p.x)**2+(pos.y-p.y)**2); }
  samples.push({ x: pos.x, y: pos.y, tx: d.x/len, ty: d.y/len, nx: -d.y/len, ny: d.x/len, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;
console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// ── Pre-compute: radius at each arc position, and Δr for a full revolution ───

const BASE_HALF_REV = Math.PI / (FREQ * 0.05); // arc per half-revolution ≈ 2.095

// For a given arc position, predict the radius change over the next full revolution
function deltaR(arcPos: number): number {
  const t0 = Math.min(1, arcPos / totalArc);
  const t1 = Math.min(1, (arcPos + 2 * BASE_HALF_REV) / totalArc);
  return evaluatePropCurve(radiusCurve, t1) - evaluatePropCurve(radiusCurve, t0);
}

// ── Generate + crossings ─────────────────────────────────────────────────────

interface Crossing { arcLen: number; spinePos: number; radius: number; side: number }

function gen(travelFn: (arc: number) => number): Crossing[] {
  let cumAngle = 0;
  const pts: Vec2[] = [];
  const nDisps: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const r = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2+(s.y-prev.y)**2);
      cumAngle += FREQ * ds * 0.05 * travelFn(s.arcLen);
    }
    const c = Math.cos(cumAngle), sn = Math.sin(cumAngle);
    const px = s.x+r*c*s.nx+r*sn*s.tx, py = s.y+r*c*s.ny+r*sn*s.ty;
    pts.push({ x: px, y: py });
    nDisps.push((px-s.x)*s.nx+(py-s.y)*s.ny);
  }

  const crossings: Crossing[] = [];
  let sideCounter = 0;
  for (let i = 1; i < nDisps.length; i++) {
    if (nDisps[i-1]! * nDisps[i]! < 0) {
      const f = Math.abs(nDisps[i-1]!)/(Math.abs(nDisps[i-1]!)+Math.abs(nDisps[i]!));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arc = s0.arcLen+f*(s1.arcLen-s0.arcLen);
      const r = evaluatePropCurve(radiusCurve, arc/totalArc);
      const p0 = pts[i-1]!, p1 = pts[i]!;
      const cx = p0.x+f*(p1.x-p0.x), cy = p0.y+f*(p1.y-p0.y);
      const sx = s0.x+f*(s1.x-s0.x), sy = s0.y+f*(s1.y-s0.y);
      const stx = s0.tx+f*(s1.tx-s0.tx), sty = s0.ty+f*(s1.ty-s0.ty);
      const proj = (cx-sx)*stx+(cy-sy)*sty;
      crossings.push({ arcLen: arc, spinePos: arc+proj, radius: r, side: sideCounter % 2 });
      sideCounter++;
    }
  }
  return crossings;
}

function stats(label: string, crossings: Crossing[]) {
  // Separate sides
  const sA = crossings.filter(c => c.side === 0);
  const sB = crossings.filter(c => c.side === 1);

  for (const [name, side] of [["A", sA], ["B", sB]] as const) {
    const arr = side as Crossing[];
    const dists: number[] = [];
    for (let i = 1; i < arr.length; i++) dists.push(arr[i]!.spinePos - arr[i-1]!.spinePos);
    if (dists.length === 0) continue;
    const m = dists.reduce((a,b)=>a+b,0)/dists.length;
    const s = Math.sqrt(dists.reduce((a,d)=>a+(d-m)**2,0)/dists.length);
    console.log(`  Side ${name}: ${arr.length} crossings, step: mean=${m.toFixed(2)} std=${s.toFixed(2)} CV=${(s/Math.abs(m)*100).toFixed(1)}% [${Math.min(...dists).toFixed(2)}, ${Math.max(...dists).toFixed(2)}]`);
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i]!;
      const d = i > 0 ? dists[i-1]!.toFixed(2) : "—";
      console.log(`    ${String(i+1).padStart(2)} | arc=${c.arcLen.toFixed(1).padStart(5)} sp=${c.spinePos.toFixed(1).padStart(7)} r=${c.radius.toFixed(1).padStart(5)} | Δ=${String(d).padStart(7)}`);
    }
  }
  console.log();
}

// ── Baseline ─────────────────────────────────────────────────────────────────

console.log("=== BASELINE ===");
const base = gen(() => 1);
stats("baseline", base);

// ── Iterative one-side correction ────────────────────────────────────────────
// Focus on side A (the one with positive spine positions).
// Between consecutive side A crossings, adjust the travel so the spine advance = target.

const TARGET = 4.19;
let travelMap: { arc: number; travel: number }[] = [];

for (let iter = 1; iter <= 6; iter++) {
  const travelFn = (arc: number): number => {
    if (travelMap.length === 0) return 1;
    if (arc <= travelMap[0]!.arc) return travelMap[0]!.travel;
    if (arc >= travelMap[travelMap.length-1]!.arc) return travelMap[travelMap.length-1]!.travel;
    for (let i = 0; i < travelMap.length-1; i++) {
      const a = travelMap[i]!, b = travelMap[i+1]!;
      if (arc >= a.arc && arc <= b.arc) {
        const f = (arc - a.arc) / (b.arc - a.arc);
        return a.travel + f * (b.travel - a.travel);
      }
    }
    return 1;
  };

  const crossings = gen(travelFn);
  const sideA = crossings.filter(c => c.side === 0);

  // Compute new travel corrections
  const newMap: { arc: number; travel: number }[] = [];
  for (let i = 0; i < sideA.length - 1; i++) {
    const c0 = sideA[i]!, c1 = sideA[i+1]!;
    const actual = c1.spinePos - c0.spinePos;
    const midArc = (c0.arcLen + c1.arcLen) / 2;
    const currentTravel = travelFn(midArc);
    // If actual > target, we need MORE revolutions (higher ω, higher travel)
    // Scale: travel *= actual/target
    const scale = actual / TARGET;
    newMap.push({ arc: midArc, travel: Math.max(0.3, Math.min(3, currentTravel * scale)) });
  }
  travelMap = newMap;

  console.log(`=== ITERATION ${iter} ===`);
  stats(`iter ${iter}`, crossings);
}
