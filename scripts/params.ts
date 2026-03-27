/**
 * params.ts — THE file to edit between experiments.
 *
 * ══════════════════════════════════════════════════════════════
 * CURRENT TARGET: gandy-1.jpg — "10-Lobe Mandala"
 * ENGINE MODE: EPICYCLIC — all orbits rotating (no speed=0)
 * ══════════════════════════════════════════════════════════════
 *
 * Machine physics:
 *   - orbit1 (slow gear, R=240, ω=1):  main arm sweeps the ring
 *   - orbit2 (fast gear, R=160, ω=11): connected gear makes radius
 *     oscillate between |240−160|=80 and 240+160=400, 10× per rev
 *   - table rotation: slowly shifts each revolution → spiral mesh fill
 *
 * Table rotation math (50k steps × speed 0.015):
 *   total θ = 750 rad
 *   table rotation = 750 × 20/T rad
 *   One lobe width = 2π/10 = 36°
 *   For table to sweep exactly 1 lobe: T = 750×20/(2π/10) ≈ 23,873
 *   → use T=24000 → 35.8° total rotation → fills one lobe, no smear
 *
 * Exp 39: single pass, see shape first
 */

import type { ExperimentConfig } from "./experiment";

const config: ExperimentConfig = {
  target: "gandy-1.jpg",

  steps:      50_000,
  width:      1200,
  height:     1200,
  lineWidth:  0.4,
  opacity:    0.6,
  background: "#faf9f6",

  passes: [
    { color: "#2196f3", phaseOffset: 0 },
  ],

  epicyclic: {
    orbits: [
      { radius: 240, speed:  1, phase: 0 },   // slow arm — sweeps ring
      { radius: 160, speed: 11, phase: 0 },   // fast gear — 10 lobes
    ],
    tableTeeth: 24000,   // ≈36° total → fills 1 lobe width
    driveTeeth: 20,
    speed:      0.015,
    lineWidth:  0.4,
  },
};

export default config;
