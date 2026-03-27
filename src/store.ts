/**
 * Reactive store — single source of truth.
 */

import { reactive, ref, watch } from "vue";
import type { Ref } from "vue";
import { defaultConfig, defaultGear } from "./engine";
import type { MachineConfig, Gear } from "./engine";
import { defaultColorState } from "./colors";
import type { ColorGeneratorState } from "./colors";
import type { Renderer } from "./renderer";

export const config: MachineConfig = reactive(defaultConfig());
export const colorState: ColorGeneratorState = reactive(defaultColorState());
export const rendererRef: Ref<Renderer | null> = ref(null);
export const running = ref(false);
export const motorTheta = ref(0);
export const showMachine = ref(true);
export const liveMode = ref(false);
export const showHelp = ref(false);

/** Which top-level view is visible. Shared so Gallery can switch to Studio. */
export const activeView = ref<"studio" | "gallery">("studio");

/** Non-null for a few seconds after an experiment is loaded from the gallery. */
export const loadedFromExpId = ref<number | null>(null);
// Auto-clear after 4 s
watch(loadedFromExpId, (id) => {
  if (id !== null) setTimeout(() => { loadedFromExpId.value = null; }, 4000);
});

export function resetAll() {
  const fresh = defaultConfig();
  config.xArm.gears.splice(0, config.xArm.gears.length, ...fresh.xArm.gears);
  config.yArm.gears.splice(0, config.yArm.gears.length, ...fresh.yArm.gears);
  config.driveTeeth = fresh.driveTeeth;
  config.tableTeeth = fresh.tableTeeth;
  config.speed = fresh.speed;
  config.lineWidth = fresh.lineWidth;

  Object.assign(colorState, defaultColorState());

  rendererRef.value?.reset(config);
  running.value = false;
  motorTheta.value = 0;
}

export function applyPreset(preset: {
  xArm: { gears: Gear[] };
  yArm: { gears: Gear[] };
  driveTeeth: number;
  tableTeeth: number;
  color?: Partial<ColorGeneratorState>;
}) {
  config.xArm.gears.splice(0, config.xArm.gears.length, ...preset.xArm.gears.map(g => ({ ...g })));
  config.yArm.gears.splice(0, config.yArm.gears.length, ...preset.yArm.gears.map(g => ({ ...g })));
  config.driveTeeth = preset.driveTeeth;
  config.tableTeeth = preset.tableTeeth;

  if (preset.color) {
    Object.assign(colorState, defaultColorState(), preset.color);
  }

  rendererRef.value?.reset(config);
  running.value = false;
  motorTheta.value = 0;

  // In live mode, immediately preview the preset
  if (liveMode.value) {
    rendererRef.value?.drawPreview();
  }
}

export function addGear(arm: "x" | "y") {
  const gears = arm === "x" ? config.xArm.gears : config.yArm.gears;
  if (gears.length >= 4) return;
  gears.push(defaultGear());
}

export function removeGear(arm: "x" | "y", index: number) {
  const gears = arm === "x" ? config.xArm.gears : config.yArm.gears;
  if (gears.length <= 1) return;
  gears.splice(index, 1);
}

// ── Gear-string parser ─────────────────────────────────────────────────────
// Format written by render.ts: "60T/R200/φ0.00 → 30T/R100/φ1.57"

function parseGearArm(s: string): Gear[] {
  if (!s.trim()) return [defaultGear()];
  const parts = s.split(/\s*→\s*/);
  const gears = parts.map(part => {
    const segs = part.trim().split("/");
    const teeth  = parseInt(segs[0]?.replace(/[^\d]/g, "") || "60")  || 60;
    const radius = parseFloat(segs[1]?.replace(/[^\d.]/g, "") || "100") || 100;
    // third segment is φ<value>; strip any leading non-numeric chars (incl. φ)
    const phase  = parseFloat(segs[2]?.replace(/^[^\d.+-]+/, "") || "0") || 0;
    return { teeth, crankRadius: radius, phase } satisfies Gear;
  });
  return gears.filter(g => g.teeth > 0);
}

export interface ExperimentSnapshot {
  id: number;
  xArmGears: string;
  yArmGears: string;
  driveTeeth: number;
  tableTeeth: number;
  speed: number;
  lineWidth: number;
  colors: string[];
}

/**
 * Load an experiment's parameters into the live studio config and
 * switch the active view to "studio".
 */
export function applyExperiment(snap: ExperimentSnapshot) {
  // ── Gears ──────────────────────────────────────────────────────────────
  const xGears = parseGearArm(snap.xArmGears);
  const yGears = parseGearArm(snap.yArmGears);
  config.xArm.gears.splice(0, config.xArm.gears.length, ...xGears);
  config.yArm.gears.splice(0, config.yArm.gears.length, ...yGears);

  // ── Global params ───────────────────────────────────────────────────────
  config.driveTeeth = snap.driveTeeth;
  config.tableTeeth = snap.tableTeeth;
  config.speed      = snap.speed;
  config.lineWidth  = snap.lineWidth;

  // ── Colors ──────────────────────────────────────────────────────────────
  const colors = snap.colors.filter(c => c.startsWith("#"));
  if (colors.length === 1) {
    colorState.mode        = "static";
    colorState.staticColor = colors[0]!;
  } else if (colors.length >= 2) {
    colorState.mode          = "gradient";
    colorState.gradientFrom  = colors[0]!;
    colorState.gradientTo    = colors[colors.length - 1]!;
  }

  // ── Reset renderer & state ──────────────────────────────────────────────
  rendererRef.value?.reset(config);
  running.value    = false;
  motorTheta.value = 0;

  // ── Switch view ─────────────────────────────────────────────────────────
  loadedFromExpId.value = snap.id;
  activeView.value = "studio";
}

export function exportPNG() {
  const r = rendererRef.value;
  if (!r) return;
  const url = r.getCanvasDataURL();
  const a = document.createElement("a");
  a.href = url;
  a.download = `cycloid-${Date.now()}.png`;
  a.click();
}
