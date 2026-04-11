# Spiral Calculation Performance

## Bottleneck Analysis

The spiral pipeline runs fully on the main thread in `spiral.ts` every time the canvas redraws.

### 1. `evaluatePropCurve` — 20-iteration binary search × every sample × 2+ curves
For 10k samples × 2 curves × 20 iterations = ~400,000 iterations just to evaluate curves.

### 2. `sampleDeformAtT` — double shape sampling + interpolation per point
Two `sampleDeformShape` calls per sample point, each evaluating a closed cubic bezier.

### 3. Object allocations — `Vec2` and `PathSample` objects in hot loops
GC pressure from `{ x, y }` literal creation inside tight loops.

### 4. Serial cumulative angle — inherently sequential, blocks parallelization
`cumulativeAngle += freq * ds * 0.05` creates a data dependency chain.

---

## Optimization Tiers

### Tier 1 — CPU Quick Wins (no WebGPU, high ROI)

**A. PropCurve LUT Cache**
Replace the 20-iteration binary search with a `Float32Array[1024]` lookup table built once when curve nodes change. ~20× speedup on property evaluation, essentially free after the first build.

**B. Typed array output**
Replace `Vec2[]` with `Float32Array` for spiral point output. Eliminates GC pressure, better CPU cache locality.

**C. Web Worker offload**
Move `sampleBezierPath` + `generateSpiralPoints` to a worker. Prevents blocking the UI thread on redraws. Use transferable buffers so no copy overhead.

### Tier 2 — WebGPU Compute

WebGPU ships in all major browsers (Chrome, Firefox, Safari, Edge) as of 2024–2025. The spiral calc is a near-perfect GPU candidate.

| Step | GPU-friendliness | Notes |
|------|-----------------|-------|
| `evalCubic` for all samples | ✅ Embarrassingly parallel | N workgroups |
| PropCurve LUT lookup | ✅ Trivial | Upload LUT as buffer |
| `sampleDeformAtT` per point | ✅ Parallel | Two bezier evals + lerp |
| Cumulative angle (prefix sum) | ⚠️ Needs parallel scan | Blelloch scan in WGSL |
| Final x/y coordinate output | ✅ Parallel | After scan completes |

Architecture:
```
GPU Buffers:
  samplesBuffer:  [x,y,tx,ty,nx,ny,t] × N   (upload once per path change)
  propLUTBuffer:  [radius_lut, freq_lut, ...]  (upload on curve change)
  dsBuffer:       [ds_0..ds_N]                  (segment lengths)
  angleBuffer:    [angle_0..angle_N]            (prefix sum result)
  outputBuffer:   [x_0,y_0..x_N,y_N]           (final points)

Pipeline:
  Pass 1: compute ds[i] = length(sample[i] - sample[i-1])   (parallel)
  Pass 2: parallel prefix scan over freq[i]*ds[i]*0.05      (log2(N) passes)
  Pass 3: compute final spiral points from angles + LUT      (parallel)
```

Expected speedup: 50–200× for >5k samples. Below ~1k samples CPU may win due to upload/readback latency.

### Tier 3 — Hybrid (recommended path)

1. Implement Tier 1 first (LUT + typed arrays) — quick, 10–20× speedup
2. Add Web Worker — isolate heavy compute, keep UI at 60fps
3. Add WebGPU as progressive enhancement with CPU fallback

```ts
const gpuAvailable = 'gpu' in navigator && await navigator.gpu.requestAdapter() !== null;
const spiralBackend = gpuAvailable ? new SpiralGPU() : new SpiralWorker();
```
