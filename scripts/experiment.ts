/**
 * experiment.ts — central data structure for ALL experiment parameters.
 *
 * Every tuneable knob lives here. params.ts exports one of these,
 * render.ts reads it. Nothing is scattered or hardcoded elsewhere.
 */

import type { MachineConfig, EpicyclicConfig, RadiusMod, SpiralConfig } from "../app/utils/engine";
export type { RadiusMod };

export interface Pass {
  color: string;
  phaseOffset: number;
  /**
   * Per-pass orbit override — models swapping the belt to a different step
   * on the cone pulley between colour passes.
   * When set, this pass uses these orbits instead of the global epicyclic.orbits.
   * This is how the real machine achieves different lobe counts per colour.
   */
  orbits?: Orbit[];
  /** Per-pass table teeth override */
  tableTeeth?: number;
}

export interface ExperimentConfig {
  /** Which reference image we're trying to replicate */
  target: string;

  /** Engine: exactly one of these must be set */
  machine?: MachineConfig;
  epicyclic?: EpicyclicConfig;
  spiral?: SpiralConfig;

  /** Drawing parameters */
  steps: number;
  width: number;
  height: number;
  lineWidth: number;
  opacity: number;
  background: string;

  /**
   * When true, each pass continues theta from where the previous one ended.
   * This correctly models the real machine: the table keeps rotating between
   * color changes, so each pass is rotated on the canvas by an additional
   * (tableRotation per pass) degrees. Creates natural color-per-lobe separation.
   *
   * When false (default), every pass resets theta=0 — phaseOffset shifts orbits.
   */
  continuousTheta?: boolean;

  /** Color passes */
  passes: Pass[];
}

/** Type guards */
export function isEpicyclic(cfg: ExperimentConfig): cfg is ExperimentConfig & { epicyclic: EpicyclicConfig } {
  return cfg.epicyclic != null;
}

export function isSpiral(cfg: ExperimentConfig): cfg is ExperimentConfig & { spiral: SpiralConfig } {
  return cfg.spiral != null;
}

/** Convenience getters that work for either engine mode */
export function getSpeed(cfg: ExperimentConfig): number {
  if (cfg.spiral) return cfg.spiral.speed;
  if (cfg.epicyclic) return cfg.epicyclic.speed;
  if (cfg.machine) return cfg.machine.speed;
  return 0.015;
}

export function getTableTeeth(cfg: ExperimentConfig): number {
  if (cfg.epicyclic) return cfg.epicyclic.tableTeeth;
  if (cfg.machine) return cfg.machine.tableTeeth;
  return 0;
}

export function getDriveTeeth(cfg: ExperimentConfig): number {
  if (cfg.epicyclic) return cfg.epicyclic.driveTeeth;
  if (cfg.machine) return cfg.machine.driveTeeth;
  return 20;
}

export function getLineWidth(cfg: ExperimentConfig): number {
  if (cfg.spiral) return cfg.spiral.lineWidth;
  if (cfg.epicyclic) return cfg.epicyclic.lineWidth;
  if (cfg.machine) return cfg.machine.lineWidth;
  return cfg.lineWidth;
}

export function tableRotationDeg(cfg: ExperimentConfig): string {
  const tt = getTableTeeth(cfg);
  if (!tt) return "off";
  const totalTheta = cfg.steps * getSpeed(cfg);
  const rotRad = totalTheta * (getDriveTeeth(cfg) / tt);
  const deg = (rotRad * 180 / Math.PI) % 360;
  return `${deg.toFixed(0)}°`;
}
