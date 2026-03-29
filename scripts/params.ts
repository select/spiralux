/**
 * params.ts — THE file to edit between experiments.
 *
 * ══════════════════════════════════════════════════════════════
 * TECHNIQUE: Single lobe — back to spiral engine from #67
 *            but more lobe-shaped (bulge in middle, taper at ends)
 * ══════════════════════════════════════════════════════════════
 *
 * Based on #67 which the user liked. Changes:
 * - Bigger breathing wobble so the coil swells in the middle
 *   and tapers at both ends → petal silhouette
 * - Orbit starts pointing upward (phase=-π/2) so the lobe
 *   extends radially from center toward the top
 * - Slightly more steps for denser fill
 */

import type { ExperimentConfig } from "./experiment";

const config: ExperimentConfig = {
  target: "gandy-1.jpg",

  steps:      20_000,
  width:      1200,
  height:     1200,
  lineWidth:  0.4,
  opacity:    0.6,
  background: "#faf9f6",
  continuousTheta: false,

  spiral: {
    baseRadius: 8,
    growth:     0.04,
    spinSpeed:  4,
    wobbles: [
      { amplitude: 30, freq: 0.004, phase: -Math.PI / 2 },
      { amplitude: 4,  freq: 0.03,  phase: 0 },
    ],
    orbit: { radius: 200, speed: 0.008, phase: -Math.PI / 2, cx: 0, cy: 0 },
    speed: 0.02,
    lineWidth: 0.4,
  },

  passes: [
    { color: "#1565c0", phaseOffset: 0 },
  ],
};

export default config;
