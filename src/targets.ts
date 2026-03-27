/**
 * targets.ts — shared target registry used by both the frontend and scripts.
 *
 * Rich metadata for known reference images; unknown images discovered at
 * runtime fall back to auto-generated info derived from the filename.
 */

export interface TargetInfo {
  /** Filename inside data/ */
  file: string;
  /** Short label for display */
  label: string;
  /** One-line description */
  description: string;
  /** Recommended canvas background colour */
  bg: string;
  /** Complexity 1–3 */
  difficulty: 1 | 2 | 3;
}

export const KNOWN_TARGETS: TargetInfo[] = [
  {
    file: "IMG_6777.jpeg",
    label: "3-Lobe Trefoil",
    description: "Pink / Cyan / Orange · 3 passes",
    bg: "#f0f0ec",
    difficulty: 1,
  },
  {
    file: "IMG_3363.webp",
    label: "3-Lobe Interlocking",
    description: "Purple / Teal / Green · 3 passes",
    bg: "#f5f5f0",
    difficulty: 2,
  },
  {
    file: "IMG_3504.webp",
    label: "Trefoil Knot",
    description: "White on Charcoal · single pass · complex",
    bg: "#1c1c1e",
    difficulty: 3,
  },
  {
    file: "gandy-1.jpg",
    label: "10-Lobe Mandala",
    description: "Rainbow · 8 passes · star pattern",
    bg: "#faf9f6",
    difficulty: 3,
  },
  {
    file: "gandy-3.jpg",
    label: "Spiral Shell",
    description: "Blue / Pink / Yellow · asymmetric",
    bg: "#f8f8f5",
    difficulty: 2,
  },
];

/** Return info for a known target, or auto-generate info for unknown files. */
export function makeTargetInfo(file: string): TargetInfo {
  const known = KNOWN_TARGETS.find(t => t.file === file);
  if (known) return known;

  // Auto-generate a readable label from the filename
  const stem = file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());

  return {
    file,
    label: stem.length > 22 ? `${stem.slice(0, 20)}…` : stem || file,
    description: "Custom target",
    bg: "#f5f5f5",
    difficulty: 1,
  };
}

export function difficultyStars(d: number): string {
  return ["★", "★★", "★★★"][d - 1] ?? "★";
}
