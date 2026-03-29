/**
 * params.ts — THE file to edit between experiments.
 *
 * ══════════════════════════════════════════════════════════════
 * Reconstructed experiment #88
 * Like #78 but mirrored smaller, with 3-lobe modulation
 * ══════════════════════════════════════════════════════════════
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
    lobes:      3,
    lobeDepth:  0.25,
    wobbles: [],
    envelope: [
      { t: 0,    radius: 3  },
      { t: 0.15, radius: 50 },
      { t: 0.5,  radius: 130 },
      { t: 0.85, radius: 50 },
      { t: 1,    radius: 3  },
    ],
    duration: 600,
    elongation: 1.15,
    orbit: {
      radius: 150,
      speed: -0.003,
      phase: -Math.PI / 2,
      cx: 0, cy: 0,
      radiusEnvelope: [
        { t: 0,    radius: 30  },
        { t: 0.5,  radius: 230 },
        { t: 1,    radius: 30  },
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
