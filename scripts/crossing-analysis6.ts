/**
 * Test spine-position-compensation: shift the backbone sampling point
 * backward by the tangent offset so crossings land at the original position.
 *
 * Instead of: P = spine(s) + r*cos(θ)*N(s) + r*sin(θ)*T(s)
 * Use:        P = spine(s - r*sin(θ)) + r*cos(θ)*N(s - r*sin(θ))
 *
 * At crossings (cos(θ)=0), sin(θ)=±1, so the spine point used is s∓r,
 * and the spiral point is exactly ON the spine at s∓r. But the key is that
 * the spine parameter s advances uniformly, so the "nominal" position s
 * advances uniformly — the actual visual crossing position is s∓r which
 * varies. Let's test if there's a better variant.
 *
 * Actually, the correct fix: shift backbone by +r*sin(θ) (not -) so the
 * tangent displacement from the orbit CANCELS the shift:
 *   P = spine(s + r*sin(θ)) + r*cos(θ)*N(s + r*sin(θ))
 * At crossing: spine(s ± r) + 0 = spine(s±r)
 *
 * Hmm this still gives s±r. The geometric offset is inherent.
 *
 * NEW IDEA: Don't shift the backbone point. Instead, sample at the
 * backbone point s but only apply the NORMAL displacement, dropping
 * the tangent component entirely. Then reintroduce the tangent via
 * an interpolation between adjacent backbone-frame samples.
 *
 * SIMPLER IDEA: Since we know the tangent offset at each point is
 * r*elliptic*sin(θ), we can PRE-DISTORT the arc-length parameter
 * to counteract this. Instead of evaluating at s, evaluate at:
 *   s_eff = s - r(s)*elliptic*sin(θ(s))
 * This shifts the spiral backward along the spine by exactly the
 * amount the tangent displacement shifts it forward.
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

// ── Dense backbone samples ───────────────────────────────────────────────────

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

// Lookup: find sample at given arc length (interpolated)
function sampleAtArc(targetArc: number): Sample {
  const clamped = Math.max(0, Math.min(totalArc, targetArc));
  // Binary search
  let lo = 0, hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.arcLen < clamped) lo = mid; else hi = mid;
  }
  const s0 = samples[lo]!, s1 = samples[hi]!;
  const range = s1.arcLen - s0.arcLen;
  const frac = range > 0 ? (clamped - s0.arcLen) / range : 0;
  return {
    x: s0.x + frac*(s1.x-s0.x),
    y: s0.y + frac*(s1.y-s0.y),
    tx: s0.tx + frac*(s1.tx-s0.tx),
    ty: s0.ty + frac*(s1.ty-s0.ty),
    nx: s0.nx + frac*(s1.nx-s0.nx),
    ny: s0.ny + frac*(s1.ny-s0.ny),
    t: clamped / totalArc,
    arcLen: clamped,
  };
}

console.log(`Total arc length: ${totalArc.toFixed(2)} px\n`);

// ── Generate spiral and find crossings ───────────────────────────────────────

type GenFn = (samples: Sample[], i: number, cumAngle: number, radius: number, elliptic: number) => Vec2;

function analyze(label: string, genFn: GenFn) {
  let cumAngle = 0;
  const spiralPts: Vec2[] = [];
  const normalDisps: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const radius = evaluatePropCurve(radiusCurve, s.t);
    if (i > 0) {
      const prev = samples[i-1]!;
      const ds = Math.sqrt((s.x-prev.x)**2 + (s.y-prev.y)**2);
      cumAngle += FREQ * ds * 0.05;
    }

    const pt = genFn(samples, i, cumAngle, radius, 1);
    spiralPts.push(pt);

    // Normal displacement from spine at this arc position
    const dx = pt.x - s.x, dy = pt.y - s.y;
    normalDisps.push(dx * s.nx + dy * s.ny);
  }

  // Find crossings
  interface Crossing { arcLen: number; t: number; radius: number; sign: number; spinePos: number; x: number; y: number }
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
      const p0 = spiralPts[i-1]!, p1 = spiralPts[i]!;
      const cx = p0.x + frac*(p1.x - p0.x), cy = p0.y + frac*(p1.y - p0.y);

      // Project crossing point onto spine to get spine position
      const spS = sampleAtArc(arcLen);
      const projDist = (cx - spS.x)*spS.tx + (cy - spS.y)*spS.ty;
      const spinePos = arcLen + projDist;

      crossings.push({ arcLen, t, radius: r, sign, spinePos, x: cx, y: cy });
    }
  }

  const sameSide: number[] = [];
  for (let i = 2; i < crossings.length; i++) {
    sameSide.push(crossings[i]!.spinePos - crossings[i-2]!.spinePos);
  }

  const mean = (a: number[]) => a.reduce((s,v)=>s+v,0)/a.length;
  const std = (a: number[]) => { const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); };

  const m = mean(sameSide), s = std(sameSide);
  console.log(`=== ${label} ===`);
  console.log(`  Crossings: ${crossings.length}  Same-side: mean=${m.toFixed(2)}  std=${s.toFixed(2)}  CV=${(s/Math.abs(m)*100).toFixed(1)}%  min=${Math.min(...sameSide).toFixed(2)}  max=${Math.max(...sameSide).toFixed(2)}`);

  console.log(`  #  | arc_s | spine_pos | radius | Δ same-side`);
  for (let i = 0; i < Math.min(crossings.length, 50); i++) {
    const c = crossings[i]!;
    const ss = i >= 2 ? sameSide[i-2]!.toFixed(2) : "—";
    console.log(`  ${String(i+1).padStart(2)} | ${c.arcLen.toFixed(1).padStart(5)} | ${c.spinePos.toFixed(1).padStart(9)} | ${c.radius.toFixed(1).padStart(6)} | ${String(ss).padStart(11)}`);
  }
  console.log();
}

// ── 1) Original: full normal + tangent ───────────────────────────────────────

analyze("ORIGINAL (normal + tangent)", (samps, i, cumAngle, radius, elliptic) => {
  const s = samps[i]!;
  const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
  return {
    x: s.x + radius*cosA*s.nx + radius*elliptic*sinA*s.tx,
    y: s.y + radius*cosA*s.ny + radius*elliptic*sinA*s.ty,
  };
});

// ── 2) Compensated: shift backbone by tangent offset ─────────────────────────

analyze("COMPENSATED SPINE (s_eff = s - r*sin(θ))", (samps, i, cumAngle, radius, elliptic) => {
  const s = samps[i]!;
  const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
  // Shift the backbone point backward by the tangent offset
  const tangentOffset = radius * elliptic * sinA;
  const sEff = sampleAtArc(s.arcLen - tangentOffset);
  return {
    x: sEff.x + radius*cosA*sEff.nx + radius*elliptic*sinA*sEff.tx,
    y: sEff.y + radius*cosA*sEff.ny + radius*elliptic*sinA*sEff.ty,
  };
});

// ── 3) Half compensation ─────────────────────────────────────────────────────

analyze("HALF COMPENSATED (s_eff = s - 0.5*r*sin(θ))", (samps, i, cumAngle, radius, elliptic) => {
  const s = samps[i]!;
  const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
  const tangentOffset = radius * elliptic * sinA;
  const sEff = sampleAtArc(s.arcLen - 0.5 * tangentOffset);
  return {
    x: sEff.x + radius*cosA*sEff.nx + radius*elliptic*sinA*sEff.tx,
    y: sEff.y + radius*cosA*sEff.ny + radius*elliptic*sinA*sEff.ty,
  };
});

// ── 4) Full compensation, normal only from compensated point ─────────────────

analyze("COMP + NORMAL ONLY from shifted spine", (samps, i, cumAngle, radius, elliptic) => {
  const s = samps[i]!;
  const cosA = Math.cos(cumAngle), sinA = Math.sin(cumAngle);
  const tangentOffset = radius * elliptic * sinA;
  const sEff = sampleAtArc(s.arcLen - tangentOffset);
  // Only apply normal displacement from the compensated point
  return {
    x: sEff.x + radius*cosA*sEff.nx,
    y: sEff.y + radius*cosA*sEff.ny,
  };
});
