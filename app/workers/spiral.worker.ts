/**
 * spiral.worker.ts — Web Worker for off-thread spiral computation.
 *
 * Receives path backbone data + spiral config, returns a flat Float32Array
 * of spiral points via transferable buffer (zero-copy).
 *
 * Uses relative imports (not ~/…) because Vite bundles workers as separate
 * entry points where Nuxt's ~ alias may not be available.
 */

import type { BezierSpiralConfig } from "../utils/spiral";
import { sampleBezierPath, generateSpiralPoints, buildSpiralLUTs } from "../utils/spiral";
import type { SpiralWorkerRequest, SpiralWorkerResponse } from "./spiral.types";

self.onmessage = (e: MessageEvent<SpiralWorkerRequest>) => {
  const { id, pathId, nodes, closed, numSamples, spiral } = e.data;

  const samples = sampleBezierPath(nodes, closed, numSamples);
  const luts = buildSpiralLUTs(spiral);
  const pts = generateSpiralPoints(samples, spiral, luts);

  const resp: SpiralWorkerResponse = { id, pathId, data: pts.data, length: pts.length };
  // Transfer the Float32Array buffer — zero-copy to main thread
  (self as unknown as Worker).postMessage(resp, [pts.data.buffer]);
};
