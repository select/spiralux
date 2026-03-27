/**
 * params.ts — THE file to edit between experiments.
 *
 * Change values here, then run:
 *   npx tsx scripts/render.ts
 *
 * Output: output/experiment.svg  (+ output/experiment.png if canvas installed)
 *
 * The image to replicate: IMG_6777.jpeg
 * Pattern analysis:
 *   - 3 large rounded lobes arranged ~120° apart (trefoil / 3-fold symmetry)
 *   - Each lobe is a dense filled mesh of fine lines (many revolutions)
 *   - The lobes overlap at a common center with tight spiraling
 *   - Drawn in 3 separate passes with 3 colors: pink, cyan/blue, orange
 *   - Each color traces the SAME shape, rotated ~120° from the others
 *   - Very fine line weight, high line count (many motor revolutions)
 *
 * This strongly suggests:
 *   - A simple 2-gear ratio producing a 3-lobed curve (like teeth ratio 3:1)
 *   - Paper table rotating slowly to fill the lobes with dense lines
 *   - 3 drawing passes with pen color changed + ~120° phase shift each time
 */

import type { MachineConfig } from "../src/engine";

/** How many motor-angle steps to draw per pass */
export const steps = 50_000;

/** Canvas/SVG dimensions in px */
export const width = 1200;
export const height = 1200;

/** Line width */
export const lineWidth = 0.6;

/** Background color (use "none" for transparent SVG) */
export const background = "#f0f0ec";

/**
 * Each pass draws the full curve with one color.
 * The real drawing has 3 passes (pink, blue, orange) each rotated ~120°.
 * `phaseOffset` is added to ALL gear phases for that pass.
 */
export const passes: { color: string; phaseOffset: number }[] = [
  { color: "#d64078", phaseOffset: 0 },
  { color: "#3fa8c8", phaseOffset: (2 * Math.PI) / 3 },
  { color: "#d07030", phaseOffset: (4 * Math.PI) / 3 },
];

/**
 * Machine configuration — tweak these to match the target image.
 *
 * Start simple: one gear per arm, try to get the 3-lobe shape,
 * then add table rotation to fill the lobes with dense lines.
 */
export const machine: MachineConfig = {
  driveTeeth: 20,

  xArm: {
    gears: [
      { teeth: 20, crankRadius: 200, phase: 0 },
      { teeth: 10, crankRadius: 150, phase: 0 },
    ],
  },

  yArm: {
    gears: [
      { teeth: 20, crankRadius: 200, phase: Math.PI / 2 },
      { teeth: 10, crankRadius: 150, phase: Math.PI / 2 },
    ],
  },

  // Step 1: table off to see raw shape
  tableTeeth: 8000,

  speed: 0.015,
  lineWidth,
};
