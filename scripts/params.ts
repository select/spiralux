/**
 * params.ts — THE file to edit between experiments.
 *
 * ══════════════════════════════════════════════════════════════
 * CURRENT TARGET: gandy-1.jpg — "10-Lobe Mandala"
 * ENGINE MODE: EPICYCLIC + RADIUS MODULATION
 * ══════════════════════════════════════════════════════════════
 *
 * Exp 42: tighten mod — keep 10-fold structure while adding variation
 *   orbit2 mod ±45 at √2×0.03 → only ~5 mod cycles over 750 rad
 *   → lobes vary gently, structure stays clear
 *   Fewer passes (4) at higher opacity for distinct colors
 */

import type { ExperimentConfig } from "./experiment";

const config: ExperimentConfig = {
  target: "gandy-1.jpg",

  steps:      60_000,
  width:      1200,
  height:     1200,
  lineWidth:  0.4,
  opacity:    0.4,
  background: "#faf9f6",

  // 4 passes at 90° — strong color contrast, covers all lobe positions
  passes: [
    { color: "#00bcd4", phaseOffset: 0 },
    { color: "#7b1fa2", phaseOffset: Math.PI / 2 },
    { color: "#e91e63", phaseOffset: Math.PI },
    { color: "#ff9800", phaseOffset: (3 * Math.PI) / 2 },
  ],

  epicyclic: {
    orbits: [
      {
        radius: 250,
        speed:  1,
        phase:  0,
        // Gentle breathing of the main ring
        mod: { amplitude: 20, freq: Math.sqrt(3) * 0.02, phase: 0 },
      },
      {
        radius: 160,
        speed:  11,
        phase:  0,
        // Moderate lobe variation — ±45 → lobes vary 115↔205
        // √2×0.03 ≈ 0.0424 → ~5 cycles over 750 rad total
        mod: { amplitude: 45, freq: Math.sqrt(2) * 0.03, phase: 0.8 },
      },
    ],
    tableTeeth: 0,
    driveTeeth: 20,
    speed:      0.015,
    lineWidth:  0.4,
  },
};

export default config;
