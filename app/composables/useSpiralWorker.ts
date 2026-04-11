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
 * - On path/config change, returns stale cache instantly (non-blocking)
 *   and dispatches async computation to the active backend
 * - First render (no cache) computes synchronously to avoid blank frame
 *
 * The worker uses transferable Float32Array buffers for zero-copy transfer.
 */

import { toRaw } from "vue";
import type { SpiralPointArray, BezierSpiralConfig } from "~/utils/spiral";
import { sampleBezierPath, generateSpiralPoints, buildSpiralLUTs } from "~/utils/spiral";
import { isWebGPUAvailable, generateSpiralPointsGPU } from "~/utils/spiralGPU";
import type { SpiralWorkerRequest, SpiralWorkerResponse } from "~/workers/spiral.types";

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  /** Cached spiral point array */
  pts: SpiralPointArray;
  /** Config fingerprint to detect staleness */
  fingerprint: string;
}

interface PendingRequest {
  id: number;
  pathId: string;
  /** Fingerprint at the time the request was made */
  fingerprint: string;
}

// ── Singleton state ──────────────────────────────────────────────────────────

let worker: Worker | null = null;
let nextRequestId = 1;
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, PendingRequest>();
let onUpdateCallback: (() => void) | null = null;

/** Which backend is active. Resolved on first use. */
type Backend = "gpu" | "worker" | "sync";
let _backend: Backend | null = null;
let _backendResolving = false;

// ── Backend detection ────────────────────────────────────────────────────────

async function resolveBackend(): Promise<Backend> {
  if (_backend) return _backend;

  // Try WebGPU first
  if (await isWebGPUAvailable()) {
    _backend = "gpu";
    console.info("[Spiral] Using WebGPU compute backend");
    return _backend;
  }

  // Try Web Worker
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

/**
 * Kick off backend detection early (called once from BezierCanvas onMounted).
 * Does not block — just starts the async probe so it's ready by first interaction.
 */
export function initSpiralBackend() {
  if (!_backend && !_backendResolving) {
    _backendResolving = true;
    resolveBackend().finally(() => { _backendResolving = false; });
  }
}

/**
 * Returns the currently active backend name (for UI display / debugging).
 */
export function getSpiralBackend(): string {
  return _backend ?? "detecting…";
}

// ── Fingerprinting ───────────────────────────────────────────────────────────

/**
 * Cheap fingerprint of a spiral config for cache invalidation.
 */
function spiralFingerprint(
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
): string {
  const parts: (string | number)[] = [
    nodes.length, closed ? 1 : 0, numSamples,
    spiral.lineWidth,
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
        parts.push(sn.x, sn.y);
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
      handleAsyncResult(e.data.pathId, e.data.id, {
        data: e.data.data,
        length: e.data.length,
      });
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

// ── Shared async result handler ──────────────────────────────────────────────

function handleAsyncResult(pathId: string, requestId: number, pts: SpiralPointArray) {
  const pend = pending.get(pathId);
  if (pend && pend.id === requestId) {
    pending.delete(pathId);
    cache.set(pathId, { pts, fingerprint: pend.fingerprint });
    onUpdateCallback?.();
  }
}

// ── GPU dispatch ─────────────────────────────────────────────────────────────

function dispatchGPU(
  requestId: number,
  pathId: string,
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
) {
  // Deep-clone to avoid reactive proxy issues in the async closure
  const rawNodes = structuredClone(toRaw(nodes));
  const rawSpiral = structuredClone(toRaw(spiral));

  generateSpiralPointsGPU(rawNodes, closed, numSamples, rawSpiral).then((result) => {
    if (result) {
      handleAsyncResult(pathId, requestId, result);
    } else {
      // GPU failed — fall back to worker or sync
      console.warn("[SpiralGPU] dispatch failed, falling back");
      _backend = ensureWorker() ? "worker" : "sync";
      dispatchWorkerOrSync(requestId, pathId, rawNodes, closed, numSamples, rawSpiral);
    }
  });
}

// ── Worker / sync dispatch ───────────────────────────────────────────────────

function dispatchWorkerOrSync(
  requestId: number,
  pathId: string,
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
) {
  const w = ensureWorker();
  if (w) {
    const msg: SpiralWorkerRequest = {
      id: requestId, pathId,
      nodes: structuredClone(nodes),
      closed,
      numSamples,
      spiral: structuredClone(spiral),
    };
    w.postMessage(msg);
  } else {
    // Sync fallback — compute immediately
    const samples = sampleBezierPath(nodes, closed, numSamples);
    const luts = buildSpiralLUTs(spiral);
    const pts = generateSpiralPoints(samples, spiral, luts);
    handleAsyncResult(pathId, requestId, pts);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Set the callback invoked when an async result arrives (triggers canvas redraw).
 */
export function setSpiralWorkerCallback(cb: () => void) {
  onUpdateCallback = cb;
}

/**
 * Request spiral computation for a path. Returns cached result immediately
 * (possibly stale) and dispatches async computation to the best available backend.
 *
 * - Cache hit (fingerprint matches): return instantly, no dispatch.
 * - Cache miss, stale entry exists: return stale data (1-frame latency),
 *   dispatch async → result triggers redraw via callback.
 * - Cache miss, no entry (first render): compute synchronously so the
 *   first frame is never blank, then cache the result.
 */
export function computeSpiral(
  pathId: string,
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
): SpiralPointArray {
  const EMPTY: SpiralPointArray = { data: new Float32Array(0), length: 0 };
  if (!spiral.enabled || nodes.length < 2) return EMPTY;

  const fp = spiralFingerprint(nodes, closed, numSamples, spiral);
  const cached = cache.get(pathId);

  // Cache hit — return immediately, nothing to do
  if (cached && cached.fingerprint === fp) {
    return cached.pts;
  }

  // ── Dispatch async computation ───────────────────────────────────────────

  const id = nextRequestId++;
  pending.set(pathId, { id, pathId, fingerprint: fp });

  if (_backend === "gpu") {
    dispatchGPU(id, pathId, nodes, closed, numSamples, spiral);
  } else if (_backend === "worker") {
    const rawNodes = structuredClone(toRaw(nodes));
    const rawSpiral = structuredClone(toRaw(spiral));
    dispatchWorkerOrSync(id, pathId, rawNodes, closed, numSamples, rawSpiral);
  } else if (_backend === "sync") {
    // Sync backend: compute immediately
    const samples = sampleBezierPath(nodes, closed, numSamples);
    const luts = buildSpiralLUTs(spiral);
    const pts = generateSpiralPoints(samples, spiral, luts);
    cache.set(pathId, { pts, fingerprint: fp });
    return pts;
  } else {
    // Backend not yet resolved — use worker or sync for now
    const rawNodes = structuredClone(toRaw(nodes));
    const rawSpiral = structuredClone(toRaw(spiral));
    dispatchWorkerOrSync(id, pathId, rawNodes, closed, numSamples, rawSpiral);
  }

  // Stale cache exists — return previous result (non-blocking, 1-frame latency)
  if (cached) {
    return cached.pts;
  }

  // No cache at all (first render) — compute synchronously to avoid blank frame
  const samples = sampleBezierPath(nodes, closed, numSamples);
  const luts = buildSpiralLUTs(spiral);
  const pts = generateSpiralPoints(samples, spiral, luts);
  cache.set(pathId, { pts, fingerprint: fp });
  return pts;
}

/**
 * Evict cache entries for paths that no longer exist.
 */
export function evictSpiralCache(activePathIds: Set<string>) {
  for (const key of cache.keys()) {
    if (!activePathIds.has(key)) {
      cache.delete(key);
      pending.delete(key);
    }
  }
}

/**
 * Clear all cached spiral data.
 */
export function clearSpiralCache() {
  cache.clear();
  pending.clear();
}
