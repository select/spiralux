/**
 * Color generator — produces colours for the drawing stroke.
 *
 * Modes:
 *  - static:   single fixed color
 *  - gradient:  lerp between two colors over the drawing lifetime
 *  - rainbow:   cycle through HSL hue continuously
 *  - palette:   cycle through a curated palette
 */

export type ColorMode = "static" | "gradient" | "rainbow" | "palette";

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
}

export const PALETTES: ColorPalette[] = [
  { id: "neon", name: "Neon", colors: ["#ff006e", "#fb5607", "#ffbe0b", "#06d6a0", "#118ab2", "#8338ec"] },
  { id: "pastel", name: "Pastel", colors: ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", "#bdb2ff", "#ffc6ff"] },
  { id: "fire", name: "Fire", colors: ["#590d22", "#800f2f", "#a4133c", "#c9184a", "#ff4d6d", "#ff758f", "#ff8fa3", "#ffb3c1"] },
  { id: "ocean", name: "Ocean", colors: ["#03045e", "#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#ade8f4"] },
  { id: "forest", name: "Forest", colors: ["#1b4332", "#2d6a4f", "#40916c", "#52b788", "#74c69d", "#95d5b2", "#b7e4c7", "#d8f3dc"] },
  { id: "sunset", name: "Sunset", colors: ["#7400b8", "#6930c3", "#5e60ce", "#5390d9", "#4ea8de", "#48bfe3", "#56cfe1", "#64dfdf", "#72efdd", "#80ffdb"] },
  { id: "monochrome", name: "Mono", colors: ["#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#6c757d", "#495057", "#343a40", "#212529"] },
];

export interface ColorGeneratorState {
  mode: ColorMode;
  staticColor: string;
  gradientFrom: string;
  gradientTo: string;
  rainbowSpeed: number;    // hue degrees per radian of motor rotation
  rainbowSaturation: number;
  rainbowLightness: number;
  paletteId: string;
  paletteSpeed: number;    // how fast to cycle through palette
}

export function defaultColorState(): ColorGeneratorState {
  return {
    mode: "rainbow",
    staticColor: "#e03050",
    gradientFrom: "#e03050",
    gradientTo: "#3080ff",
    rainbowSpeed: 2,
    rainbowSaturation: 80,
    rainbowLightness: 60,
    paletteId: "neon",
    paletteSpeed: 3,
  };
}

/** Get the stroke color for a given motor angle θ */
export function getColor(state: ColorGeneratorState, theta: number): string {
  switch (state.mode) {
    case "static":
      return state.staticColor;

    case "gradient": {
      // map theta 0..200π → t 0..1
      const t = Math.min(1, Math.max(0, theta / (200 * Math.PI)));
      return lerpHex(state.gradientFrom, state.gradientTo, t);
    }

    case "rainbow": {
      const hue = (state.rainbowSpeed * theta * (180 / Math.PI)) % 360;
      return `hsl(${hue}, ${state.rainbowSaturation}%, ${state.rainbowLightness}%)`;
    }

    case "palette": {
      const palette = PALETTES.find((p) => p.id === state.paletteId) ?? PALETTES[0]!;
      const colors = palette!.colors;
      const idx = (state.paletteSpeed * theta * (180 / Math.PI)) / 360;
      const i = Math.floor(idx) % colors.length;
      const j = (i + 1) % colors.length;
      const frac = idx - Math.floor(idx);
      return lerpHex(colors[i]!, colors[j]!, frac);
    }
  }
}

/* ---- color math helpers ---- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}
