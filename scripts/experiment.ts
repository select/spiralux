/**
 * experiment.ts — central data structure for ALL experiment parameters.
 *
 * Every tuneable knob lives here. params.ts exports one of these,
 * render.ts reads it. Nothing is scattered or hardcoded elsewhere.
 */

import type { MachineConfig, EpicyclicConfig, RadiusMod } from "../app/utils/engine";
export type { RadiusMod };

export interface Pass {
  color: string;
  phaseOffset: number;
}

export interface ExperimentConfig {
  /** Which reference image we're trying to replicate */
  target: string;

  /** Engine: exactly one of these must be set */
  machine?: MachineConfig;
  epicyclic?: EpicyclicConfig;

  /** Drawing parameters */
  steps: number;
  width: number;
  height: number;
  lineWidth: number;
  opacity: number;
  background: string;

  /** Color passes */
  passes: Pass[];
}

/** Type guard */
export function isEpicyclic(cfg: ExperimentConfig): cfg is ExperimentConfig & { epicyclic: EpicyclicConfig } {
  return cfg.epicyclic != null;
}

/** Convenience getters that work for either engine mode */
export function getSpeed(cfg: ExperimentConfig): number {
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
