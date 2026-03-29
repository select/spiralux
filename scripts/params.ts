/**
 * params.ts — THE file to edit between experiments.
 *
 * ══════════════════════════════════════════════════════════════
 * TECHNIQUE: Single trefoil lobe — smooth envelope interpolation
 * ══════════════════════════════════════════════════════════════
 *
 * Uses the new size envelope for perfectly smooth thin→fat→thin
 * transitions instead of sinusoidal wobbles for shaping.
 *
 * Envelope: 8px → 90px → 8px (cosine-interpolated)
 * orbit: R=250, covers ~240° of arc
 * spinSpeed: 8 for dense mesh fill
 * duration: 600 (= 30000 steps × 0.02 speed)
 */

import type { ExperimentConfig } from "./experiment";

const config: ExperimentConfig = {
  target: "IMG_3504.webp",

  steps:      30_000,
  width:      1200,
  height:     1200,
  lineWidth:  0.25,
  opacity:    0.7,
  background: "#1c1c1e",
  continuousTheta: false,

  spiral: {
    baseRadius: 8,
    growth:     0,
    spinSpeed:  2,
    wobbles: [],
    envelope: [
      { t: 0,    radius: 3  },
      { t: 0.15, radius: 80 },
      { t: 0.5,  radius: 220 },
      { t: 0.85, radius: 80 },
      { t: 1,    radius: 3  },
    ],
    duration: 600,   // 30000 × 0.02
    orbit: {
      radius: 200,
      speed: 0.003,
      phase: -Math.PI / 2,
      cx: 0, cy: 30,
      radiusEnvelope: [
        { t: 0,    radius: 40  },
        { t: 0.5,  radius: 380 },
        { t: 1,    radius: 40  },
      ],
    },
    speed: 0.02,
    lineWidth: 0.25,
  },

  passes: [
    { color: "#dde8f0", phaseOffset: 0 },
  ],
};

export default config;
