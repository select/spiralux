/**
 * useSpiralWorker — singleton composable managing off-thread spiral computation.
 *
 * Backend priority:
 *   1. WebGPU compute shader  (if available — massively parallel, ~1ms)
 *   2. Web Worker             (fallback — same JS, off main thread)
 *   3. Synchronous CPU        (last resort — blocks main thread)
 *
 * Architecture:
 * - Maintains a per-path cache of computed spiral point arrays
 * - On cache miss, returns stale cache (non-blocking) and dispatches ONE
 *   async computation. Only one in-flight request per path at a time.
 * - When the result arrives, cache is updated and a redraw is triggered.
 *   If the fingerprint changed while in-flight, the next render cycle
 *   will dispatch again automatically.
 * - First render (no cache) computes synchronously to avoid blank frame.
 */

import { toRaw } from "vue";
import type { SpiralPointArray, BezierSpiralConfig } from "~/utils/spiral";
import { sampleBezierPath, generateSpiralPoints, buildSpiralLUTs } from "~/utils/spiral";
import { isWebGPUAvailable, generateSpiralPointsGPU } from "~/utils/spiralGPU";
import type { SpiralWorkerRequest, SpiralWorkerResponse } from "~/workers/spiral.types";

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  pts: SpiralPointArray;
  fingerprint: string;
}

// ── Singleton state ──────────────────────────────────────────────────────────

let worker: Worker | null = null;
let nextRequestId = 1;
const cache = new Map<string, CacheEntry>();

/**
 * Per-path in-flight tracking. Only ONE async computation at a time per path.
 * Maps pathId → the fingerprint currently being computed.
 * Prevents flooding the GPU/worker with redundant requests.
 */
const inflight = new Map<string, string>();

let onUpdateCallback: (() => void) | null = null;

/** Which backend is active. Resolved on first use. */
type Backend = "gpu" | "worker" | "sync";
let _backend: Backend | null = null;
let _backendResolving = false;

// ── Backend detection ────────────────────────────────────────────────────────

async function resolveBackend(): Promise<Backend> {
  if (_backend) return _backend;

  if (await isWebGPUAvailable()) {
    _backend = "gpu";
    console.info("[Spiral] Using WebGPU compute backend");
    return _backend;
  }

  const w = ensureWorker();
  if (w) {
    _backend = "worker";
    console.info("[Spiral] Using Web Worker backend");
    return _backend;
  }

  _backend = "sync";
  console.info("[Spiral] Using synchronous CPU backend");
  return _backend;
}

export function initSpiralBackend() {
  if (!_backend && !_backendResolving) {
    _backendResolving = true;
    resolveBackend().finally(() => { _backendResolving = false; });
  }
}

export function getSpiralBackend(): string {
  return _backend ?? "detecting…";
}

// ── Fingerprinting ───────────────────────────────────────────────────────────

function spiralFingerprint(
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
): string {
  const parts: (string | number)[] = [
    nodes.length, closed ? 1 : 0, numSamples,
    spiral.lineWidth,
    spiral.rotation ?? 0,
    spiral.scale ?? 1,
    spiral.deformation?.length ?? 0,
  ];
  for (const n of nodes) {
    parts.push(n.x, n.y, n.handleIn.x, n.handleIn.y, n.handleOut.x, n.handleOut.y);
  }
  for (const curve of [spiral.radius, spiral.frequency, spiral.elliptic, spiral.orientation]) {
    for (const cn of curve.nodes) {
      parts.push(cn.t, cn.value, cn.handleIn.dt, cn.handleIn.dv, cn.handleOut.dt, cn.handleOut.dv);
    }
  }
  if (spiral.deformation) {
    for (const dp of spiral.deformation) {
      parts.push(dp.t, dp.nodes.length);
      for (const sn of dp.nodes) {
        parts.push(sn.x, sn.y, sn.handleIn.dx, sn.handleIn.dy, sn.handleOut.dx, sn.handleOut.dy);
      }
    }
  }
  return parts.join(",");
}

// ── Worker lifecycle ─────────────────────────────────────────────────────────

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof window === "undefined") return null;

  try {
    worker = new Worker(
      new URL("../workers/spiral.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<SpiralWorkerResponse>) => {
      const { pathId, data, length } = e.data;
      onAsyncComplete(pathId, { data, length });
    };
    worker.onerror = (err) => {
      console.warn("[SpiralWorker] error, falling back to sync:", err.message);
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    console.warn("[SpiralWorker] failed to create worker, using sync fallback");
    return null;
  }
}

// ── Async result handler ─────────────────────────────────────────────────────

/**
 * Called when any async backend (GPU or worker) completes.
 * Updates cache with the result and triggers a canvas redraw.
 * The next render cycle will check if another dispatch is needed
 * (fingerprint may have changed while this was in-flight).
 */
function onAsyncComplete(pathId: string, pts: SpiralPointArray) {
  const fp = inflight.get(pathId);
  if (!fp) return; // no in-flight request (stale callback)

  inflight.delete(pathId);
  cache.set(pathId, { pts, fingerprint: fp });
  onUpdateCallback?.();
}

// ── Dispatch helpers ─────────────────────────────────────────────────────────

type NodeArg = { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[];

function dispatchGPU(
  pathId: string,
  nodes: NodeArg,
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
) {
  const rawNodes = structuredClone(toRaw(nodes));
  const rawSpiral = structuredClone(toRaw(spiral));

  generateSpiralPointsGPU(rawNodes, closed, numSamples, rawSpiral)
    .then((result) => {
      if (result) {
        onAsyncComplete(pathId, result);
      } else {
        // GPU failed — fall back
        console.warn("[SpiralGPU] dispatch failed, falling back");
        _backend = ensureWorker() ? "worker" : "sync";
        inflight.delete(pathId);
        onUpdateCallback?.(); // trigger redraw to recompute via fallback
      }
    })
    .catch(() => {
      inflight.delete(pathId);
      _backend = ensureWorker() ? "worker" : "sync";
      onUpdateCallback?.();
    });
}

function dispatchWorker(
  pathId: string,
  nodes: NodeArg,
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
) {
  const w = ensureWorker();
  if (!w) {
    // Worker gone — compute sync
    inflight.delete(pathId);
    const samples = sampleBezierPath(nodes, closed, numSamples);
    const luts = buildSpiralLUTs(spiral);
    const pts = generateSpiralPoints(samples, spiral, luts);
    const fp = inflight.get(pathId);
    cache.set(pathId, { pts, fingerprint: fp ?? "" });
    return;
  }

  const id = nextRequestId++;
  const msg: SpiralWorkerRequest = {
    id, pathId,
    nodes: structuredClone(toRaw(nodes)),
    closed,
    numSamples,
    spiral: structuredClone(toRaw(spiral)),
  };
  w.postMessage(msg);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function setSpiralWorkerCallback(cb: () => void) {
  onUpdateCallback = cb;
}

/**
 * Request spiral computation for a path. Returns cached result immediately
 * (possibly stale) and dispatches async computation if needed.
 *
 * Key invariant: at most ONE in-flight request per path. This prevents
 * flooding the GPU/worker and ensures results are never discarded due to
 * id mismatch races.
 */
export function computeSpiral(
  pathId: string,
  nodes: NodeArg,
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
): SpiralPointArray {
  const EMPTY: SpiralPointArray = { data: new Float32Array(0), length: 0 };
  if (!spiral.enabled || nodes.length < 2) return EMPTY;

  const fp = spiralFingerprint(nodes, closed, numSamples, spiral);
  const cached = cache.get(pathId);

  // Cache hit — return immediately
  if (cached && cached.fingerprint === fp) {
    return cached.pts;
  }

  // ── Async dispatch (if not already in-flight for this path) ──────────────

  if (!inflight.has(pathId)) {
    inflight.set(pathId, fp);

    if (_backend === "gpu") {
      dispatchGPU(pathId, nodes, closed, numSamples, spiral);
    } else if (_backend === "worker") {
      dispatchWorker(pathId, nodes, closed, numSamples, spiral);
    } else if (_backend === "sync") {
      inflight.delete(pathId);
      const samples = sampleBezierPath(nodes, closed, numSamples);
      const luts = buildSpiralLUTs(spiral);
      const pts = generateSpiralPoints(samples, spiral, luts);
      cache.set(pathId, { pts, fingerprint: fp });
      return pts;
    } else {
      // Backend not yet resolved — worker or sync for now
      dispatchWorker(pathId, nodes, closed, numSamples, spiral);
    }
  }

  // Return stale cache while async computes (1-frame latency)
  if (cached) {
    return cached.pts;
  }

  // No cache at all (first render) — sync fallback so first frame isn't blank
  const samples = sampleBezierPath(nodes, closed, numSamples);
  const luts = buildSpiralLUTs(spiral);
  const pts = generateSpiralPoints(samples, spiral, luts);
  cache.set(pathId, { pts, fingerprint: fp });
  return pts;
}

export function evictSpiralCache(activePathIds: Set<string>) {
  for (const key of cache.keys()) {
    if (!activePathIds.has(key)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

export function clearSpiralCache() {
  cache.clear();
  inflight.clear();
}
