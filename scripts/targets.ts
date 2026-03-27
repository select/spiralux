/**
 * targets.ts — registry of all reference images to replicate.
 *
 * Each entry describes the physical drawing, its visual character,
 * suggested starting params, and analysis notes for the experiment loop.
 */

export interface Target {
  /** Filename inside data/ */
  file: string;
  /** Short label for display */
  label: string;
  /** One-line description */
  description: string;
  /** Recommended canvas background */
  bg: string;
  /** Recommended first-pass colors */
  defaultColors: string[];
  /** Number of color passes in the original */
  passes: number;
  /** Complexity 1–3 */
  difficulty: 1 | 2 | 3;
  /** Analysis notes for the experiment loop */
  notes: string;
}

export const TARGETS: Target[] = [
  {
    file: "IMG_6777.jpeg",
    label: "3-Lobe Trefoil",
    description: "3 large teardrop lobes, pink/cyan/orange, fine mesh grid, 3-fold symmetry",
    bg: "#f0f0ec",
    defaultColors: ["#d64078", "#3fa8c8", "#d07030"],
    passes: 3,
    difficulty: 1,
    notes: `
- 3 teardrop lobes arranged 120° apart, each filled with dense crossing mesh
- 3 color passes, each rotated 120° via phaseOffset: 0, 2π/3, 4π/3
- Each lobe is a cardioid/limaçon shape (speed ratio 1:2 per arm)
- Center has small tight spiral where lobes overlap
- Table rotation fills the lobe interior with the grid mesh
- crankRadius ratio R1:R2 ≈ 4:3 creates slight inner loop = spiral center
    `.trim(),
  },
  {
    file: "IMG_3363.webp",
    label: "3-Lobe Interlocking",
    description: "3 large interlocking rounded lobes, purple/teal/green, complex overlaps, 3-fold symmetry",
    bg: "#f5f5f0",
    defaultColors: ["#6a2fa0", "#1a8a8a", "#4a9040"],
    passes: 3,
    difficulty: 2,
    notes: `
- Larger, rounder lobes than IMG_6777 — more circular, less teardrop
- Heavy overlap in center creates complex enclosed inner regions
- 3-fold symmetry with inner loop structures visible
- The "bulge" of each lobe is more pronounced → larger crankRadius or different ratio
- Inner curling suggests multiple harmonics (2+ gears per arm)
- Try R1≈R2 (near-nephroid) with table rotation for the inner loops
    `.trim(),
  },
  {
    file: "IMG_3504.webp",
    label: "Trefoil Knot",
    description: "Single white on charcoal, 3-fold knot, large outer arcs + inner bubbles, ultra-dense mesh",
    bg: "#1c1c1e",
    defaultColors: ["#e0e8f0"],
    passes: 1,
    difficulty: 3,
    notes: `
- DARK background (#1c1c1e), single light/white pass
- Three large outer arcs form a trefoil knot outline
- Three inner enclosed "bubble" regions from interlocking arcs
- Very complex harmonic structure — multiple gears per arm required
- The structure has both a large outer loop AND inner closed sub-loops
- Dense mesh suggests many motor revolutions (high steps)
- Likely approach: 3+ gears per arm or irrational gear ratios
- Start: single arm with 3+ harmonics, then add table rotation
    `.trim(),
  },
  {
    file: "gandy-1.jpg",
    label: "10-Lobe Mandala",
    description: "~10 overlapping rounded lobes, rainbow 8-pass, star/flower mandala, small center hole",
    bg: "#faf9f6",
    defaultColors: ["#00bcd4", "#9c27b0", "#4caf50", "#ff5722", "#ff9800", "#e91e63", "#2196f3", "#8bc34a"],
    passes: 8,
    difficulty: 3,
    notes: `
- ~10 evenly-spaced rounded lobes in a ring (not overlapping at center)
- Rainbow palette — each pass is a different color (~8 passes)
- Small white center hole — table rotation fills just the lobe band
- High gear ratio needed: ~10 lobes → speed ratio ~10:1 or similar
- Each lobe is roughly circular/elliptical
- The crossing mesh pattern within each lobe creates the grid effect
- Phase offset per pass = 2π/N where N = number of passes
    `.trim(),
  },
  {
    file: "gandy-3.jpg",
    label: "Spiral Shell",
    description: "Asymmetric nautilus spiral, blue/pink/yellow, 3 large sweeping arcs with inner loops",
    bg: "#f8f8f5",
    defaultColors: ["#1565c0", "#c2185b", "#f9a825"],
    passes: 3,
    difficulty: 2,
    notes: `
- Asymmetric — NOT rotationally symmetric (unlike all other targets)
- Three arcs of different sizes (one large outer, one medium, one small inner)
- Looks like a nautilus/shell or Archimedean spiral
- Each colored pass traces a different size/shape arc
- Blue is largest outer arc, pink medium, yellow smallest inner
- Non-equal crankRadius per pass rather than phaseOffset rotation
- The inner loops suggest limaçon with self-intersection
- Try: same gears per pass but different crankRadius modifiers, or
  use 3 separate MachineConfig objects with different radii
    `.trim(),
  },
];

export function getTarget(file: string): Target {
  return TARGETS.find(t => t.file === file) ?? TARGETS[0]!;
}
