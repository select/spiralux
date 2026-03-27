/**
 * Reactive store — single source of truth.
 */

import { reactive, ref } from "vue";
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

export function exportPNG() {
  const r = rendererRef.value;
  if (!r) return;
  const url = r.getCanvasDataURL();
  const a = document.createElement("a");
  a.href = url;
  a.download = `cycloid-${Date.now()}.png`;
  a.click();
}
