/**
 * Type definitions for spiral worker messages.
 * Shared between worker and main thread — kept free of heavy imports.
 */

import type { BezierSpiralConfig } from "~/utils/spiral";

export interface SpiralWorkerRequest {
  id: number;
  pathId: string;
  nodes: { x: number; y: number; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } }[];
  closed: boolean;
  numSamples: number;
  spiral: BezierSpiralConfig;
}

export interface SpiralWorkerResponse {
  id: number;
  pathId: string;
  data: Float32Array;
  length: number;
}
