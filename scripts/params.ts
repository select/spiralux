/**
 * params.ts — THE file to edit between experiments.
 *
 * Change values here, then run:
 *   pnpm render -- --notes "what you tried"
 *
 * ══════════════════════════════════════════════════════════════
 * CURRENT TARGET: IMG_3504.webp — "Trefoil Knot"
 * ══════════════════════════════════════════════════════════════
 *
 * Pattern analysis:
 *   - DARK background (#1c1c1e charcoal), single light/white pass
 *   - 3-fold symmetry — three large outer arcs forming a trefoil knot
 *   - Three inner enclosed "bubble" regions from arc interlocking
 *   - Ultra-dense mesh fill — many motor revolutions
 *   - Complex harmonic structure: multiple gear harmonics per arm
 *   - The outer arcs are large, sweeping (~full canvas width)
 *   - The inner bubbles are tighter/smaller
 *
 * Strategy:
 *   1. Start simple: find a gear ratio that produces a knot-like outline
 *   2. Low steps first to see the base curve shape
 *   3. Then add table rotation to fill with mesh
 *   4. Build up harmonic complexity with more gears per arm
 */

import type { MachineConfig } from "../src/engine";

/** Which reference image this session targets */
export const target = "IMG_3504.webp";

/** Steps per pass — keep low (5k–10k) during shape iteration */
export const steps = 5_000;

/** Canvas dimensions */
export const width = 1200;
export const height = 1200;

/** Line width */
export const lineWidth = 0.5;

/** Dark background for the trefoil knot target */
export const background = "#1c1c1e";

/** Single light pass — no color rotation needed for single-pass target */
export const passes: { color: string; phaseOffset: number }[] = [
  { color: "#dde8f0", phaseOffset: 0 },
];

/**
 * Starting config — simple 1:3 Lissajous to see the 3-fold base shape.
 * The trefoil knot likely needs 2+ gears per arm for the complex outline.
 */
export const machine: MachineConfig = {
  driveTeeth: 20,

  xArm: {
    gears: [
      // 60T → speed = 20/60 = 1/3 (slow component)
      { teeth: 60, crankRadius: 300, phase: 0 },
    ],
  },

  yArm: {
    gears: [
      // 20T → speed = 1 (fast component — 1:3 ratio → 3 lobes)
      { teeth: 20, crankRadius: 300, phase: Math.PI / 2 },
    ],
  },

  // Table off to see raw curve shape first
  tableTeeth: 0,

  speed: 0.015,
  lineWidth,
};
