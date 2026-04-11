/**
 * useSpiralWorker — singleton composable managing off-thread spiral computation.
 *
 * Architecture:
 * - Maintains a per-path cache of computed spiral point arrays
 * - On path/config change, posts work to the Web Worker
 * - drawPathSpiral reads from cache (1-frame latency on first change)
 * - Falls back to synchronous computation when no cache exists yet
 *
 * The worker uses transferable Float32Array buffers for zero-copy transfer.
 */

import type { SpiralPointArray, BezierSpiralConfig } from "~/utils/spiral";
import { sampleBezierPath, generateSpiralPoints, buildSpiralLUTs } from "~/utils/spiral";
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
}

// ── Singleton state ──────────────────────────────────────────────────────────

let worker: Worker | null = null;
let nextRequestId = 1;
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, PendingRequest>();
let onUpdateCallback: (() => void) | null = null;

// ── Fingerprinting ───────────────────────────────────────────────────────────

/**
 * Cheap fingerprint of a spiral config for cache invalidation.
 * Uses node positions/values + deformation point count — doesn't need to be
 * cryptographically strong, just detect meaningful changes.
 */
function spiralFingerprint(
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[],
  closed: boolean,
  numSamples: number,
  spiral: BezierSpiralConfig,
): string {
  // Fast fingerprint: sample a few key values
  const parts: (string | number)[] = [
    nodes.length, closed ? 1 : 0, numSamples,
    spiral.lineWidth,
    spiral.deformation?.length ?? 0,
  ];
  // Path node positions (first, middle, last)
  for (const n of nodes) {
    parts.push(n.x | 0, n.y | 0, n.handleOut.x | 0, n.handleOut.y | 0);
  }
  // Property curve nodes
  for (const curve of [spiral.radius, spiral.frequency, spiral.elliptic, spiral.orientation]) {
    for (const cn of curve.nodes) {
      parts.push(cn.t, cn.value, cn.handleIn.dt, cn.handleIn.dv, cn.handleOut.dt, cn.handleOut.dv);
    }
  }
  // Deformation shape summary
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
      const { id, pathId, data, length } = e.data;
      // Only accept if this is still the latest request for this path
      const pend = pending.get(pathId);
      if (pend && pend.id === id) {
        pending.delete(pathId);
        // Update cache — recompute fingerprint is not needed, it was set on request
        const existing = cache.get(pathId);
        if (existing) {
          existing.pts = { data, length };
        } else {
          cache.set(pathId, { pts: { data, length }, fingerprint: "" });
        }
        // Trigger canvas redraw
        onUpdateCallback?.();
      }
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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Set the callback invoked when a worker result arrives (triggers canvas redraw).
 */
export function setSpiralWorkerCallback(cb: () => void) {
  onUpdateCallback = cb;
}

/**
 * Request spiral computation for a path. Returns cached result if fresh,
 * otherwise computes synchronously as fallback and posts to worker for next frame.
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

  // Cache hit — return immediately
  if (cached && cached.fingerprint === fp) {
    return cached.pts;
  }

  // Cache miss or stale — compute synchronously for this frame
  const samples = sampleBezierPath(nodes, closed, numSamples);
  const luts = buildSpiralLUTs(spiral);
  const pts = generateSpiralPoints(samples, spiral, luts);

  // Update cache
  cache.set(pathId, { pts, fingerprint: fp });

  // Post to worker for future frames (async, results replace cache on arrival)
  const w = ensureWorker();
  if (w) {
    const id = nextRequestId++;
    pending.set(pathId, { id, pathId });
    const msg: SpiralWorkerRequest = { id, pathId, nodes, closed, numSamples, spiral };
    w.postMessage(msg);
  }

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
