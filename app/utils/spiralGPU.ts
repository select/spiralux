/**
 * WebGPU-accelerated spiral point generation.
 *
 * Architecture (hybrid CPU/GPU split):
 *   CPU → backbone sampling, ds computation, cumulative angle prefix sum
 *         (sequential, lightweight ~1ms)
 *   GPU → per-point: LUT sampling, deformation shape evaluation,
 *         final coordinate computation (parallel, the hot path)
 *
 * The prefix sum stays on CPU because it's inherently sequential and fast.
 * The per-point deformation + coordinate math is embarrassingly parallel
 * and benefits enormously from GPU dispatch (10k–120k independent points).
 */

import type { BezierSpiralConfig, PathSample, SpiralPointArray, DeformPoint } from "~/utils/spiral";
import { sampleBezierPath, buildSpiralLUTs } from "~/utils/spiral";

// ── Constants ────────────────────────────────────────────────────────────────

const PROP_LUT_SIZE = 1024;
/** Max deformation points supported in one dispatch */
const MAX_DEFORM_POINTS = 16;
/** Max nodes per deformation shape */
const MAX_DEFORM_NODES = 32;

// ── Singleton GPU state ──────────────────────────────────────────────────────

let _device: GPUDevice | null = null;
let _pipeline: GPUComputePipeline | null = null;
let _supported: boolean | null = null; // null = not checked yet

/**
 * Check if WebGPU is available. Caches the result.
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (_supported !== null) return _supported;
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    _supported = false;
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    _supported = adapter !== null;
    return _supported;
  } catch {
    _supported = false;
    return false;
  }
}

/**
 * Initialize WebGPU device and compile the compute pipeline.
 * Call once at startup; subsequent calls are no-ops.
 */
async function ensureDevice(): Promise<GPUDevice | null> {
  if (_device) return _device;
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return null;

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    _device = await adapter.requestDevice();
    _device.lost.then(() => {
      console.warn("[SpiralGPU] device lost");
      _device = null;
      _pipeline = null;
    });
    return _device;
  } catch {
    return null;
  }
}

async function ensurePipeline(): Promise<{ device: GPUDevice; pipeline: GPUComputePipeline } | null> {
  const device = await ensureDevice();
  if (!device) return null;

  if (!_pipeline) {
    const module = device.createShaderModule({ code: SPIRAL_WGSL });
    // Check for shader compilation errors
    if (module.getCompilationInfo) {
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter(m => m.type === "error");
      if (errors.length > 0) {
        console.error("[SpiralGPU] WGSL compilation errors:", errors.map(e =>
          `line ${e.lineNum}:${e.linePos}: ${e.message}`
        ).join("\n"));
        return null;
      }
    }
    _pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
  }
  return { device, pipeline: _pipeline };
}

// ── Pack deformation data for GPU upload ─────────────────────────────────────

/**
 * Packs deformation data into flat Float32Arrays for GPU upload.
 *
 * Layout:
 *   deformMeta: [numPoints, 0, 0, 0] (vec4 header)
 *     then per point: [t, numNodes, 0, 0] (vec4)
 *   deformNodes: per point × per node: [x, y, hOutDx, hOutDy, hInDx, hInDy, 0, 0] (2×vec4)
 */
function packDeformation(deformation: DeformPoint[] | undefined): {
  meta: Float32Array;
  nodes: Float32Array;
} {
  const numPts = Math.min(deformation?.length ?? 0, MAX_DEFORM_POINTS);

  // Header + per-point metadata (vec4-aligned)
  const meta = new Float32Array(4 + MAX_DEFORM_POINTS * 4);
  meta[0] = numPts;

  // Node data: MAX_DEFORM_POINTS × MAX_DEFORM_NODES × 8 floats
  const nodes = new Float32Array(MAX_DEFORM_POINTS * MAX_DEFORM_NODES * 8);

  if (!deformation) return { meta, nodes };

  for (let i = 0; i < numPts; i++) {
    const dp = deformation[i]!;
    const nodeCount = Math.min(dp.nodes.length, MAX_DEFORM_NODES);
    meta[4 + i * 4] = dp.t;
    meta[4 + i * 4 + 1] = nodeCount;

    for (let j = 0; j < nodeCount; j++) {
      const sn = dp.nodes[j]!;
      const base = (i * MAX_DEFORM_NODES + j) * 8;
      nodes[base + 0] = sn.x;
      nodes[base + 1] = sn.y;
      nodes[base + 2] = sn.handleOut.dx;
      nodes[base + 3] = sn.handleOut.dy;
      nodes[base + 4] = sn.handleIn.dx;
      nodes[base + 5] = sn.handleIn.dy;
      // 6, 7 = padding
    }
  }

  return { meta, nodes };
}

// ── GPU dispatch ─────────────────────────────────────────────────────────────

/**
 * Generate spiral points using WebGPU compute shader.
 * Returns null if WebGPU is unavailable — caller should fall back to CPU.
 */
export async function generateSpiralPointsGPU(
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  config: BezierSpiralConfig,
): Promise<SpiralPointArray | null> {
  const gpu = await ensurePipeline();
  if (!gpu) return null;

  const { device, pipeline } = gpu;

  // ── CPU work: backbone sampling + prefix sum (sequential, fast) ──────────

  const samples = sampleBezierPath(nodes, closed, numSamples);
  const n = samples.length;
  if (n < 2) return { data: new Float32Array(0), length: 0 };

  const luts = buildSpiralLUTs(config);
  const radiusLUT = luts.radius;
  const freqLUT = luts.frequency;

  // Pack samples into flat array: [x, y, tx, ty, nx, ny, t, pad] × n (vec4-aligned)
  const samplesData = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    const s = samples[i]!;
    const base = i * 8;
    samplesData[base + 0] = s.x;
    samplesData[base + 1] = s.y;
    samplesData[base + 2] = s.tx;
    samplesData[base + 3] = s.ty;
    samplesData[base + 4] = s.nx;
    samplesData[base + 5] = s.ny;
    samplesData[base + 6] = s.t;
    // samplesData[base + 7] = 0; // padding
  }

  // Compute cumulative angles on CPU (prefix sum — inherently sequential)
  const angles = new Float32Array(n);
  angles[0] = 0;
  for (let i = 1; i < n; i++) {
    const s = samples[i]!;
    const prev = samples[i - 1]!;
    const dx = s.x - prev.x;
    const dy = s.y - prev.y;
    const ds = Math.sqrt(dx * dx + dy * dy);
    const freq = sampleLUT(freqLUT, s.t);
    angles[i] = angles[i - 1]! + freq * ds * 0.05;
  }

  // Pack deformation data
  const deform = packDeformation(config.deformation);

  // ── GPU buffers ──────────────────────────────────────────────────────────

  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

  const samplesBuffer = createBuffer(device, samplesData, usage);
  const anglesBuffer = createBuffer(device, angles, usage);
  const radiusLUTBuffer = createBuffer(device, radiusLUT, usage);
  const deformMetaBuffer = createBuffer(device, deform.meta, usage);
  const deformNodesBuffer = createBuffer(device, deform.nodes, usage);

  // Output buffer
  const outputSize = n * 2 * 4; // n points × 2 floats × 4 bytes
  const outputBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Staging buffer for readback
  const stagingBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Uniform: [numPoints, lutSize, 0, 0] — must be Uint32Array to match WGSL u32 layout
  const uniforms = new Uint32Array([n, PROP_LUT_SIZE, 0, 0]);
  const uniformBuffer = createBuffer(device, uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

  // ── Bind group ───────────────────────────────────────────────────────────

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: samplesBuffer } },
      { binding: 2, resource: { buffer: anglesBuffer } },
      { binding: 3, resource: { buffer: radiusLUTBuffer } },
      { binding: 4, resource: { buffer: deformMetaBuffer } },
      { binding: 5, resource: { buffer: deformNodesBuffer } },
      { binding: 6, resource: { buffer: outputBuffer } },
    ],
  });

  // ── Dispatch ─────────────────────────────────────────────────────────────

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(n / 256));
  pass.end();

  encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputSize);
  device.queue.submit([encoder.finish()]);

  // ── Readback ─────────────────────────────────────────────────────────────

  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
  stagingBuffer.unmap();

  // Cleanup
  samplesBuffer.destroy();
  anglesBuffer.destroy();
  radiusLUTBuffer.destroy();
  deformMetaBuffer.destroy();
  deformNodesBuffer.destroy();
  outputBuffer.destroy();
  stagingBuffer.destroy();
  uniformBuffer.destroy();

  return { data: result, length: n };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createBuffer(device: GPUDevice, data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
  const buffer = device.createBuffer({ size: data.byteLength, usage });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function sampleLUT(lut: Float32Array, t: number): number {
  const fi = t * (PROP_LUT_SIZE - 1);
  const i = fi | 0;
  if (i >= PROP_LUT_SIZE - 1) return lut[PROP_LUT_SIZE - 1]!;
  if (i < 0) return lut[0]!;
  const f = fi - i;
  return lut[i]! + (lut[i + 1]! - lut[i]!) * f;
}

// ── WGSL Compute Shader ─────────────────────────────────────────────────────

const SPIRAL_WGSL = /* wgsl */ `

// ── Bindings ─────────────────────────────────────────────────────────────────

struct Uniforms {
  numPoints: u32,
  lutSize:   u32,
  _pad0:     u32,
  _pad1:     u32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

// Samples: [x, y, tx, ty, nx, ny, t, pad] × N  (stride = 8 floats)
@group(0) @binding(1) var<storage, read> samples: array<f32>;

// Cumulative angles (prefix-summed on CPU)
@group(0) @binding(2) var<storage, read> angles: array<f32>;

// Property LUTs (1024 floats each)
@group(0) @binding(3) var<storage, read> radiusLUT: array<f32>;

// Deformation: meta header + per-point node data
// Meta: [numPoints, 0, 0, 0] then per point [t, numNodes, 0, 0] (stride 4)
@group(0) @binding(4) var<storage, read> deformMeta: array<f32>;
// Nodes: MAX_DEFORM_POINTS × MAX_DEFORM_NODES × 8 floats
// Per node: [x, y, hOutDx, hOutDy, hInDx, hInDy, pad, pad]
@group(0) @binding(5) var<storage, read> deformNodes: array<f32>;

// Output: [x, y] × N (stride = 2 floats)
@group(0) @binding(6) var<storage, read_write> output: array<f32>;

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_DEFORM_POINTS: u32 = 16u;
const MAX_DEFORM_NODES:  u32 = 32u;
const TWO_PI: f32 = 6.283185307179586;

// ── LUT sampling ─────────────────────────────────────────────────────────────

fn sampleRadius(t: f32) -> f32 {
  let fi = t * f32(u.lutSize - 1u);
  let i = u32(fi);
  if (i >= u.lutSize - 1u) { return radiusLUT[u.lutSize - 1u]; }
  let frac = fi - f32(i);
  return radiusLUT[i] + (radiusLUT[i + 1u] - radiusLUT[i]) * frac;
}

// ── Cubic bezier 1D ──────────────────────────────────────────────────────────

fn cubicBez(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
  let m = 1.0 - t;
  return m * m * m * p0 + 3.0 * m * m * t * p1 + 3.0 * m * t * t * p2 + t * t * t * p3;
}

// ── Deformation shape sampling ───────────────────────────────────────────────

fn sampleDeformShape(pointIdx: u32, numNodes: u32, angle: f32) -> vec2<f32> {
  if (numNodes < 2u) {
    return vec2<f32>(cos(angle), sin(angle));
  }

  // Normalize angle to [0, 2π)
  var a = angle % TWO_PI;
  if (a < 0.0) { a += TWO_PI; }

  let uParam = a / TWO_PI;
  let segF = uParam * f32(numNodes);
  let seg = u32(segF) % numNodes;
  let lt = segF - floor(segF);

  let nodeBase = pointIdx * MAX_DEFORM_NODES * 8u;
  let i0 = nodeBase + seg * 8u;
  let i1 = nodeBase + ((seg + 1u) % numNodes) * 8u;

  let p0x = deformNodes[i0];
  let p0y = deformNodes[i0 + 1u];
  let p0hox = deformNodes[i0 + 2u];
  let p0hoy = deformNodes[i0 + 3u];

  let p1x = deformNodes[i1];
  let p1y = deformNodes[i1 + 1u];
  let p1hix = deformNodes[i1 + 4u];
  let p1hiy = deformNodes[i1 + 5u];

  return vec2<f32>(
    cubicBez(p0x, p0x + p0hox, p1x + p1hix, p1x, lt),
    cubicBez(p0y, p0y + p0hoy, p1y + p1hiy, p1y, lt)
  );
}

// ── Sample deformation at backbone t ─────────────────────────────────────────

fn sampleDeformAtT(t: f32, angle: f32) -> vec2<f32> {
  let numPts = u32(deformMeta[0]);

  if (numPts == 0u) {
    return vec2<f32>(cos(angle), sin(angle));
  }

  if (numPts == 1u) {
    let nn = u32(deformMeta[4u + 1u]);
    return sampleDeformShape(0u, nn, angle);
  }

  let firstT = deformMeta[4u];
  let firstN = u32(deformMeta[4u + 1u]);
  if (t <= firstT) {
    return sampleDeformShape(0u, firstN, angle);
  }

  let lastIdx = numPts - 1u;
  let lastT = deformMeta[4u + lastIdx * 4u];
  let lastN = u32(deformMeta[4u + lastIdx * 4u + 1u]);
  if (t >= lastT) {
    return sampleDeformShape(lastIdx, lastN, angle);
  }

  // Find bracketing pair
  for (var i = 0u; i < numPts - 1u; i++) {
    let aT = deformMeta[4u + i * 4u];
    let bT = deformMeta[4u + (i + 1u) * 4u];
    if (t >= aT && t <= bT) {
      let span = bT - aT;
      var blend: f32 = 0.0;
      if (span > 0.0) { blend = (t - aT) / span; }
      let aN = u32(deformMeta[4u + i * 4u + 1u]);
      let bN = u32(deformMeta[4u + (i + 1u) * 4u + 1u]);
      let pa = sampleDeformShape(i, aN, angle);
      let pb = sampleDeformShape(i + 1u, bN, angle);
      let m = 1.0 - blend;
      return vec2<f32>(pa.x * m + pb.x * blend, pa.y * m + pb.y * blend);
    }
  }

  return sampleDeformShape(lastIdx, lastN, angle);
}

// ── Main compute kernel ──────────────────────────────────────────────────────

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.numPoints) { return; }

  let base = idx * 8u;
  let sx  = samples[base];
  let sy  = samples[base + 1u];
  let tx  = samples[base + 2u];
  let ty  = samples[base + 3u];
  let nx  = samples[base + 4u];
  let ny  = samples[base + 5u];
  let t   = samples[base + 6u];

  let angle  = angles[idx];
  let radius = sampleRadius(t);

  let deformPt = sampleDeformAtT(t, angle);

  let rotT = radius * deformPt.x;
  let rotN = radius * deformPt.y;

  output[idx * 2u]      = sx + rotT * nx + rotN * tx;
  output[idx * 2u + 1u] = sy + rotT * ny + rotN * ty;
}
`;

/**
 * Destroy GPU resources and reset state.
 */
export function destroySpiralGPU() {
  _pipeline = null;
  if (_device) {
    _device.destroy();
    _device = null;
  }
}
