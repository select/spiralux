/**
 * params.ts — THE file to edit between experiments.
 *
 * Change values here, then run:
 *   pnpm render -- --notes "what you tried"
 *
 * ══════════════════════════════════════════════════════════════
 * CURRENT TARGET: IMG_3504.webp — "Trefoil Knot"
 * ENGINE MODE: EPICYCLIC (wheels on wheels)
 * ══════════════════════════════════════════════════════════════
 *
 * Trefoil knot in complex form: z(t) = i·e^{-it} − 2i·e^{2it}
 *   Orbit 1: R=150, speed=-1 (CW), phase=π/2
 *   Orbit 2: R=300, speed=+2 (CCW), phase=-π/2
 */

import type { ExperimentConfig } from "./experiment";

const config: ExperimentConfig = {
  target: "IMG_3504.webp",

  // ── Drawing ───────────────────────────────────────────
  steps:      200_000,
  width:      1200,
  height:     1200,
  lineWidth:  0.3,
  opacity:    0.7,
  background: "#1c1c1e",

  // ── Passes ────────────────────────────────────────────
  passes: [
    { color: "#dde8f0", phaseOffset: 0 },
  ],

  // ── Engine (epicyclic) ────────────────────────────────
  epicyclic: {
    orbits: [
      { radius: 150, speed: -1, phase: Math.PI / 2 },
      { radius: 300, speed:  2, phase: -Math.PI / 2 },
    ],
    tableTeeth: 15000,
    driveTeeth: 20,
    speed:      0.015,
    lineWidth:  0.3,
  },
};

export default config;
