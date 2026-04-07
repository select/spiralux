/**
 * Compute ACTUAL geometric spine crossings — where the spiral polyline
 * crosses from one side of the backbone to the other.
 *
 * The key insight: the spiral point is NOT on the spine when cumAngle = nπ.
 * The actual crossing depends on the tangent offset: r(s)*sin(θ).
 * We find crossings by checking where the NORMAL component of the spiral
 * displacement changes sign (spiral crosses from left to right of spine).
 */

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

// ── Example 2 data ───────────────────────────────────────────────────────────

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

// ── Sample backbone and generate spiral (same as spiral.ts) ──────────────────

const N = 8000;
interface Sample { x: number; y: number; tx: number; ty: number; nx: number; ny: number; t: number; arcLen: number }

const samples: Sample[] = [];
let totalArc = 0;
const arcLens: number[] = [];

for (let i = 0; i <= N; i++) {
  const u = i / N;
  const pos = evalCubic(pathNodes[0]!, pathNodes[1]!, u);
  const d = evalCubicDeriv(pathNodes[0]!, pathNodes[1]!, u);
  const len = Math.sqrt(d.x*d.x + d.y*d.y) || 1;
  const tx = d.x/len, ty = d.y/len;
  if (i > 0) {
    const prev = samples[samples.length-1]!;
    totalArc += Math.sqrt((pos.x-prev.x)**2 + (pos.y-prev.y)**2);
  }
  arcLens.push(totalArc);
  samples.push({ x: pos.x, y: pos.y, tx, ty, nx: -ty, ny: tx, t: 0, arcLen: totalArc });
}
for (const s of samples) s.t = s.arcLen / totalArc;

console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// ── Generate spiral points (matching spiral.ts exactly) ──────────────────────

type TravelFn = (radius: number, ctx: { rRef: number; rFloor: number; rMax: number; t: number }) => number;

function generateAndFindCrossings(label: string, travelFn: TravelFn) {
  // Precompute ref values
  const REF = 128;
  let rSum = 0, rMax = 0;
  for (let i = 0; i < REF; i++) {
    const r = evaluatePropCurve(radiusCurve, i/(REF-1));
    rSum += r; if (r > rMax) rMax = r;
  }
  const rRef = Math.max(rSum/REF, rMax * 0.05);
  const rFloor = rMax * 0.05;

  // Generate spiral points AND track normal displacement from spine
  const spiralPts: Vec2[] = [];
  const normalDisp: number[] = []; // signed distance from spine (positive = left)
  let cumAngle = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const radius = evaluatePropCurve(radiusCurve, s.t);
    const freq = FREQ;

    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2 + (s.y-prev.y)**2);
      const travel = travelFn(radius, { rRef, rFloor, rMax, t: s.t });
      cumAngle += freq * ds * 0.05 * travel;
    }

    const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
    const localT = radius * cosA;
    const localN = radius * sinA; // elliptic=1

    const px = s.x + localT * s.nx + localN * s.tx;
    const py = s.y + localT * s.ny + localN * s.ty;
    spiralPts.push({ x: px, y: py });

    // Normal displacement = component of (spiralPt - spinePt) along normal
    // = localT (since localT * normal + localN * tangent)
    normalDisp.push(localT); // = radius * cos(cumAngle)
  }

  // Find zero-crossings of normalDisp (sign changes = spiral crosses spine)
  const crossings: { arcLen: number; t: number; radius: number; x: number; y: number }[] = [];

  for (let i = 1; i < normalDisp.length; i++) {
    const d0 = normalDisp[i-1]!, d1 = normalDisp[i]!;
    if (d0 * d1 < 0) { // sign change
      const frac = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1));
      const s0 = samples[i-1]!, s1 = samples[i]!;
      const arcLen = s0.arcLen + frac * (s1.arcLen - s0.arcLen);
      const t = arcLen / totalArc;
      const r = evaluatePropCurve(radiusCurve, t);
      // Interpolate crossing position
      const p0 = spiralPts[i-1]!, p1 = spiralPts[i]!;
      const cx = p0.x + frac * (p1.x - p0.x);
      const cy = p0.y + frac * (p1.y - p0.y);
      crossings.push({ arcLen, t, radius: r, x: cx, y: cy });
    }
  }

  // Compute Euclidean distances between consecutive crossing POSITIONS
  const distances: number[] = [];
  const arcDistances: number[] = [];
  for (let i = 1; i < crossings.length; i++) {
    const c0 = crossings[i-1]!, c1 = crossings[i]!;
    distances.push(Math.sqrt((c1.x-c0.x)**2 + (c1.y-c0.y)**2));
    arcDistances.push(c1.arcLen - c0.arcLen);
  }

  const mean = distances.reduce((a,b)=>a+b,0) / distances.length;
  const std = Math.sqrt(distances.reduce((a,d)=>a+(d-mean)**2,0) / distances.length);
  const cv = std/mean;
  const minD = Math.min(...distances);
  const maxD = Math.max(...distances);

  const arcMean = arcDistances.reduce((a,b)=>a+b,0) / arcDistances.length;
  const arcStd = Math.sqrt(arcDistances.reduce((a,d)=>a+(d-arcMean)**2,0) / arcDistances.length);

  console.log(`=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}`);
  console.log(`  Euclidean dist: mean=${mean.toFixed(2)}  std=${std.toFixed(2)}  CV=${(cv*100).toFixed(1)}%  min=${minD.toFixed(2)}  max=${maxD.toFixed(2)}  ratio=${(maxD/minD).toFixed(2)}`);
  console.log(`  Arc-len dist:   mean=${arcMean.toFixed(2)}  std=${arcStd.toFixed(2)}`);
  console.log();

  console.log("  #  |  euclid  | arc_dist | spine_t | radius  | crossing (x, y)");
  console.log("  ---|----------|----------|---------|---------|----------------");
  for (let i = 0; i < crossings.length; i++) {
    const c = crossings[i]!;
    const ed = i > 0 ? distances[i-1]!.toFixed(2) : "—";
    const ad = i > 0 ? arcDistances[i-1]!.toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | ${String(ed).padStart(8)} | ${String(ad).padStart(8)} | ${c.t.toFixed(4).padStart(7)} | ${c.radius.toFixed(1).padStart(7)} | (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`);
  }
  console.log();
  return { crossings, distances };
}

// ── 1) No correction ────────────────────────────────────────────────────────

generateAndFindCrossings("NO CORRECTION (current code)", () => 1);

// ── 2) 1/r correction (mean ref) ────────────────────────────────────────────

generateAndFindCrossings("1/r MEAN-REF, strength=1.0", (r, ctx) => {
  return ctx.rRef / Math.max(r, ctx.rFloor);
});

// ── 3) 1/r correction strength 0.5 ──────────────────────────────────────────

generateAndFindCrossings("1/r MEAN-REF, strength=0.5", (r, ctx) => {
  return Math.pow(ctx.rRef / Math.max(r, ctx.rFloor), 0.5);
});
