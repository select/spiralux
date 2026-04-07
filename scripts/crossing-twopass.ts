/**
 * TWO-PASS predictive correction.
 *
 * Pass 1: Generate spiral with no correction, find all crossings
 * Pass 2: For each same-side pair, compute required angular rate adjustment
 * Pass 3: Build smooth travel correction function, regenerate, verify
 */

interface Vec2 { x: number; y: number }
interface BezierNode { x: number; y: number; handleIn: Vec2; handleOut: Vec2 }
interface PropNode { t: number; value: number; handleIn: { dt: number; dv: number }; handleOut: { dt: number; dv: number } }
interface PropCurve { nodes: PropNode[]; min: number; max: number }

function cubicBezier1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const mu = 1 - u; return mu*mu*mu*p0 + 3*mu*mu*u*p1 + 3*mu*u*u*p2 + u*u*u*p3;
}
function evaluatePropCurve(curve: PropCurve, t: number): number {
  const nodes = curve.nodes;
  if (nodes.length === 0) return (curve.min + curve.max) / 2;
  if (nodes.length === 1) return nodes[0]!.value;
  if (t <= nodes[0]!.t) return nodes[0]!.value;
  if (t >= nodes[nodes.length - 1]!.t) return nodes[nodes.length - 1]!.value;
  let segIdx = 0;
  for (let i = 0; i < nodes.length - 1; i++) { if (t >= nodes[i]!.t && t <= nodes[i + 1]!.t) { segIdx = i; break; } }
  const a = nodes[segIdx]!, b = nodes[segIdx + 1]!;
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) { const mid = (lo+hi)/2; if (cubicBezier1D(a.t, a.t+a.handleOut.dt, b.t+b.handleIn.dt, b.t, mid) < t) lo = mid; else hi = mid; }
  const u = (lo+hi)/2;
  return cubicBezier1D(a.value, a.value+a.handleOut.dv, b.value+b.handleIn.dv, b.value, u);
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
  const u = i/N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  const d = evalCubicDeriv(pathNodes[0]!, pathNodes[1]!, u);
  const len = Math.sqrt(d.x*d.x+d.y*d.y)||1;
  if (i > 0) { const p = samples[samples.length-1]!; totalArc += Math.sqrt((pos.x-p.x)**2+(pos.y-p.y)**2); }
  samples.push({ x: pos.x, y: pos.y, tx: d.x/len, ty: d.y/len, nx: -d.y/len, ny: d.x/len, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;
console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// ── Generate spiral + find crossings ─────────────────────────────────────────

interface Crossing { arcLen: number; spinePos: number; radius: number; sampleIdx: number }

function generateAndCrossings(travelAtArc: (arc: number) => number): Crossing[] {
  let cumAngle = 0;
  const spiralPts: Vec2[] = [];
  const normalDisps: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const r = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2+(s.y-prev.y)**2);
      cumAngle += FREQ * ds * 0.05 * travelAtArc(s.arcLen);
    }
    const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
    const px = s.x + r*cosA*s.nx + r*sinA*s.tx;
    const py = s.y + r*cosA*s.ny + r*sinA*s.ty;
    spiralPts.push({ x: px, y: py });
    normalDisps.push((px-s.x)*s.nx + (py-s.y)*s.ny);
  }

  const crossings: Crossing[] = [];
  for (let i = 1; i < normalDisps.length; i++) {
    if (normalDisps[i-1]! * normalDisps[i]! < 0) {
      const frac = Math.abs(normalDisps[i-1]!)/(Math.abs(normalDisps[i-1]!)+Math.abs(normalDisps[i]!));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arc = s0.arcLen+frac*(s1.arcLen-s0.arcLen);
      const r = evaluatePropCurve(radiusCurve, arc/totalArc);
      const p0 = spiralPts[i-1]!, p1 = spiralPts[i]!;
      const cx = p0.x+frac*(p1.x-p0.x), cy = p0.y+frac*(p1.y-p0.y);
      const sx = s0.x+frac*(s1.x-s0.x), sy = s0.y+frac*(s1.y-s0.y);
      const stx = s0.tx+frac*(s1.tx-s0.tx), sty = s0.ty+frac*(s1.ty-s0.ty);
      const proj = (cx-sx)*stx + (cy-sy)*sty;
      crossings.push({ arcLen: arc, spinePos: arc+proj, radius: r, sampleIdx: i });
    }
  }
  return crossings;
}

function printStats(label: string, crossings: Crossing[]) {
  const sameSide: number[] = [];
  for (let i = 2; i < crossings.length; i++) sameSide.push(crossings[i]!.spinePos - crossings[i-2]!.spinePos);
  if (sameSide.length === 0) { console.log(`=== ${label} === NO DATA\n`); return; }
  const mean = sameSide.reduce((a,b)=>a+b,0)/sameSide.length;
  const std = Math.sqrt(sameSide.reduce((a,d)=>a+(d-mean)**2,0)/sameSide.length);
  console.log(`=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}  Same-side: mean=${mean.toFixed(2)} std=${std.toFixed(2)} CV=${(std/Math.abs(mean)*100).toFixed(1)}% min=${Math.min(...sameSide).toFixed(2)} max=${Math.max(...sameSide).toFixed(2)}`);
  for (let i = 0; i < crossings.length; i++) {
    const c = crossings[i]!;
    const ss = i >= 2 ? sameSide[i-2]!.toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | arc=${c.arcLen.toFixed(1).padStart(5)} sp=${c.spinePos.toFixed(1).padStart(7)} r=${c.radius.toFixed(1).padStart(5)} | Δ360=${String(ss).padStart(7)}`);
  }
  console.log();
}

// ── Pass 1: Baseline ─────────────────────────────────────────────────────────

const baseCrossings = generateAndCrossings(() => 1);
printStats("PASS 1: BASELINE", baseCrossings);

// ── Pass 2: Compute correction schedule ──────────────────────────────────────
// For each same-side pair (n, n+2), compute the ratio:
//   actual_arc_step / desired_arc_step
// This is the travel correction needed in that arc interval.

const targetStep = 4.19; // desired same-side distance (from constant-r section)

// Build correction at each crossing's arc position
const corrections: { arc: number; travel: number }[] = [];

// For each pair of same-side crossings
for (let i = 0; i < baseCrossings.length - 2; i++) {
  const c0 = baseCrossings[i]!;
  const c2 = baseCrossings[i + 2]!;
  const actualSameSide = c2.spinePos - c0.spinePos;
  // We need the same-side distance to be targetStep
  // actual = 2*arcStep + sign*Δr
  // desired = targetStep
  // ratio = actual/desired tells us how much to scale
  // If actual > desired, we need more revolutions (speed up ω) → travel > 1
  // If actual < desired, slow down → travel < 1
  const ratio = actualSameSide / targetStep;
  const midArc = (c0.arcLen + c2.arcLen) / 2;
  // travel = ratio means: speed up by ratio to fit more revolutions
  corrections.push({ arc: midArc, travel: Math.max(0.3, Math.min(3, ratio)) });
}

console.log("=== CORRECTION SCHEDULE ===");
for (const c of corrections) {
  console.log(`  arc=${c.arc.toFixed(1).padStart(5)}  travel=${c.travel.toFixed(3)}`);
}
console.log();

// Interpolate travel at any arc position
function interpolateTravel(arc: number): number {
  if (corrections.length === 0) return 1;
  if (arc <= corrections[0]!.arc) return corrections[0]!.travel;
  if (arc >= corrections[corrections.length-1]!.arc) return corrections[corrections.length-1]!.travel;
  for (let i = 0; i < corrections.length - 1; i++) {
    const c0 = corrections[i]!, c1 = corrections[i+1]!;
    if (arc >= c0.arc && arc <= c1.arc) {
      const f = (arc - c0.arc) / (c1.arc - c0.arc);
      return c0.travel + f * (c1.travel - c0.travel);
    }
  }
  return 1;
}

// ── Pass 3: Regenerate with correction ───────────────────────────────────────

const correctedCrossings = generateAndCrossings(interpolateTravel);
printStats("PASS 3: CORRECTED (1 iteration)", correctedCrossings);

// ── Pass 4: Iterate correction ───────────────────────────────────────────────

// Repeat: use corrected crossings to refine the correction
let currentTravel = interpolateTravel;

for (let iter = 2; iter <= 5; iter++) {
  const iterCrossings = generateAndCrossings(currentTravel);
  
  const newCorrections: { arc: number; travel: number }[] = [];
  for (let i = 0; i < iterCrossings.length - 2; i++) {
    const c0 = iterCrossings[i]!, c2 = iterCrossings[i+2]!;
    const actual = c2.spinePos - c0.spinePos;
    const ratio = actual / targetStep;
    const midArc = (c0.arcLen + c2.arcLen) / 2;
    // Multiplicative update: multiply current travel by new ratio
    const oldTravel = currentTravel(midArc);
    newCorrections.push({ arc: midArc, travel: Math.max(0.3, Math.min(3, oldTravel * ratio)) });
  }

  const prevTravel = currentTravel;
  currentTravel = (arc: number) => {
    if (newCorrections.length === 0) return 1;
    if (arc <= newCorrections[0]!.arc) return newCorrections[0]!.travel;
    if (arc >= newCorrections[newCorrections.length-1]!.arc) return newCorrections[newCorrections.length-1]!.travel;
    for (let i = 0; i < newCorrections.length - 1; i++) {
      const c0 = newCorrections[i]!, c1 = newCorrections[i+1]!;
      if (arc >= c0.arc && arc <= c1.arc) {
        const f = (arc - c0.arc) / (c1.arc - c0.arc);
        return c0.travel + f * (c1.travel - c0.travel);
      }
    }
    return 1;
  };

  const nextCrossings = generateAndCrossings(currentTravel);
  printStats(`PASS ${iter+1}: ITERATION ${iter}`, nextCrossings);
}
