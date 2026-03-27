/**
 * Curated presets — interesting gear configurations for the machine model.
 */

import type { Gear } from "./engine";
import type { ColorGeneratorState } from "./colors";

export interface Preset {
  id: string;
  name: string;
  icon: string;
  xArm: { gears: Gear[] };
  yArm: { gears: Gear[] };
  driveTeeth: number;
  tableTeeth: number;
  color?: Partial<ColorGeneratorState>;
}

export const PRESETS: Preset[] = [
  {
    id: "classic-rose",
    name: "Rose",
    icon: "🌹",
    driveTeeth: 20,
    tableTeeth: 0,
    xArm: { gears: [
      { teeth: 60, crankRadius: 100, phase: 0 },
      { teeth: 40, crankRadius: 60, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 80, crankRadius: 90, phase: 0 },
      { teeth: 30, crankRadius: 50, phase: Math.PI / 4 },
    ]},
    color: { mode: "rainbow", rainbowSpeed: 2 },
  },
  {
    id: "lotus",
    name: "Lotus",
    icon: "🪷",
    driveTeeth: 20,
    tableTeeth: 0,
    xArm: { gears: [
      { teeth: 40, crankRadius: 120, phase: 0 },
      { teeth: 100, crankRadius: 50, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 50, crankRadius: 110, phase: Math.PI / 2 },
      { teeth: 70, crankRadius: 40, phase: 0 },
    ]},
    color: { mode: "palette", paletteId: "sunset", paletteSpeed: 4 },
  },
  {
    id: "butterfly",
    name: "Butterfly",
    icon: "🦋",
    driveTeeth: 20,
    tableTeeth: 200,
    xArm: { gears: [
      { teeth: 30, crankRadius: 130, phase: 0 },
      { teeth: 45, crankRadius: 40, phase: 0.5 },
    ]},
    yArm: { gears: [
      { teeth: 40, crankRadius: 100, phase: 0 },
      { teeth: 60, crankRadius: 60, phase: 1.0 },
    ]},
    color: { mode: "rainbow", rainbowSpeed: 3, rainbowSaturation: 90, rainbowLightness: 55 },
  },
  {
    id: "starburst",
    name: "Starburst",
    icon: "✦",
    driveTeeth: 20,
    tableTeeth: 0,
    xArm: { gears: [
      { teeth: 20, crankRadius: 80, phase: 0 },
      { teeth: 70, crankRadius: 70, phase: 0 },
      { teeth: 30, crankRadius: 40, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 25, crankRadius: 80, phase: Math.PI / 2 },
      { teeth: 55, crankRadius: 60, phase: 0 },
    ]},
    color: { mode: "palette", paletteId: "neon", paletteSpeed: 6 },
  },
  {
    id: "galaxy",
    name: "Galaxy",
    icon: "🌌",
    driveTeeth: 20,
    tableTeeth: 300,
    xArm: { gears: [
      { teeth: 50, crankRadius: 140, phase: 0 },
      { teeth: 81, crankRadius: 50, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 60, crankRadius: 130, phase: Math.PI / 3 },
      { teeth: 97, crankRadius: 40, phase: 0 },
    ]},
    color: { mode: "palette", paletteId: "ocean", paletteSpeed: 2 },
  },
  {
    id: "mandala",
    name: "Mandala",
    icon: "☸️",
    driveTeeth: 20,
    tableTeeth: 0,
    xArm: { gears: [
      { teeth: 30, crankRadius: 100, phase: 0 },
      { teeth: 50, crankRadius: 40, phase: 0 },
      { teeth: 20, crankRadius: 30, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 30, crankRadius: 100, phase: Math.PI / 2 },
      { teeth: 50, crankRadius: 40, phase: Math.PI / 2 },
      { teeth: 20, crankRadius: 30, phase: Math.PI / 2 },
    ]},
    color: { mode: "gradient", gradientFrom: "#ff006e", gradientTo: "#3a86ff" },
  },
  {
    id: "turbine",
    name: "Turbine",
    icon: "⚙️",
    driveTeeth: 20,
    tableTeeth: 150,
    xArm: { gears: [
      { teeth: 45, crankRadius: 90, phase: 0 },
      { teeth: 20, crankRadius: 70, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 35, crankRadius: 90, phase: 0 },
      { teeth: 25, crankRadius: 55, phase: 2.0 },
    ]},
    color: { mode: "rainbow", rainbowSpeed: 5, rainbowSaturation: 75, rainbowLightness: 50 },
  },
  {
    id: "heartbeat",
    name: "Heart",
    icon: "💜",
    driveTeeth: 20,
    tableTeeth: 0,
    xArm: { gears: [
      { teeth: 40, crankRadius: 120, phase: 0 },
      { teeth: 80, crankRadius: 60, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 40, crankRadius: 120, phase: 0 },
      { teeth: 60, crankRadius: 20, phase: 1.0 },
    ]},
    color: { mode: "palette", paletteId: "fire", paletteSpeed: 3 },
  },
  {
    id: "atom",
    name: "Atom",
    icon: "⚛️",
    driveTeeth: 20,
    tableTeeth: 0,
    xArm: { gears: [
      { teeth: 20, crankRadius: 150, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 21, crankRadius: 150, phase: 0.3 },
    ]},
    color: { mode: "rainbow", rainbowSpeed: 0.5, rainbowSaturation: 85, rainbowLightness: 65 },
  },
  {
    id: "weave",
    name: "Weave",
    icon: "🕸️",
    driveTeeth: 20,
    tableTeeth: 250,
    xArm: { gears: [
      { teeth: 30, crankRadius: 100, phase: 0 },
      { teeth: 90, crankRadius: 50, phase: 0 },
    ]},
    yArm: { gears: [
      { teeth: 30, crankRadius: 100, phase: 0 },
      { teeth: 60, crankRadius: 50, phase: 0 },
    ]},
    color: { mode: "palette", paletteId: "forest", paletteSpeed: 4 },
  },
];
