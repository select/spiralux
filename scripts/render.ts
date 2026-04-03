/**
 * render.ts — headless SVG renderer for Spiralux.
 *
 * Reads a single ExperimentConfig from scripts/params.ts.
 * Every tuneable knob is in that config — nothing hardcoded here.
 *
 * Usage:
 *   pnpm render                           # render to output/
 *   pnpm render -- --notes "description"  # render + tag with notes
 *   pnpm render -- --open                 # render + open in viewer
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { penPosition, epicyclicPenPosition, spiralPenPosition } from "../app/utils/engine";
import type { MachineConfig, EpicyclicConfig, RadiusMod } from "../app/utils/engine";
import {
  isEpicyclic, isSpiral, getSpeed, getTableTeeth, getDriveTeeth, getLineWidth, tableRotationDeg,
} from "./experiment";
import type { ExperimentConfig } from "./experiment";
import cfg from "./params";

const outDir = "output";
mkdirSync(outDir, { recursive: true });

// ── Pen position ────────────────────────────────────────────

import type { Orbit } from "../app/utils/engine";

function getPenPosition(
  theta: number,
  phaseOffset: number,
  orbitOverride?: Orbit[],
  tableTeethOverride?: number,
): { x: number; y: number } {
  if (isSpiral(cfg)) {
    // Phase offset shifts the orbit start position, not the spiral winding
    const sc = phaseOffset === 0 || !cfg.spiral.orbit
      ? cfg.spiral
      : { ...cfg.spiral, orbit: { ...cfg.spiral.orbit, phase: cfg.spiral.orbit.phase + phaseOffset } };
    return spiralPenPosition(sc, theta);
  }
  if (isEpicyclic(cfg)) {
    // Per-pass orbit override: models swapping cone pulley step between passes
    const baseEc = orbitOverride
      ? { ...cfg.epicyclic, orbits: orbitOverride, tableTeeth: tableTeethOverride ?? cfg.epicyclic.tableTeeth }
      : cfg.epicyclic;
    const ec = phaseOffset === 0 ? baseEc : applyEpicyclicPhase(baseEc, phaseOffset);
    return epicyclicPenPosition(ec, theta);
  }
  if (cfg.machine) {
    const mc = phaseOffset === 0 ? cfg.machine : applyMachinePhase(cfg.machine, phaseOffset);
    return penPosition(mc, theta);
  }
  throw new Error("No machine, epicyclic, or spiral config in params.ts");
}

function applyMachinePhase(m: MachineConfig, off: number): MachineConfig {
  return {
    ...m,
    xArm: { gears: m.xArm.gears.map(g => ({ ...g, phase: g.phase + off })) },
    yArm: { gears: m.yArm.gears.map(g => ({ ...g, phase: g.phase + off })) },
  };
}

function applyEpicyclicPhase(e: EpicyclicConfig, off: number): EpicyclicConfig {
  return { ...e, orbits: e.orbits.map(o => ({ ...o, phase: o.phase + off })) };
}

// ── SVG rendering ───────────────────────────────────────────

function renderSVG(): string {
  const cx = cfg.width / 2;
  const cy = cfg.height / 2;
  const speed = getSpeed(cfg);
  const lw = getLineWidth(cfg);

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.width}" height="${cfg.height}" viewBox="0 0 ${cfg.width} ${cfg.height}">`);

  if (cfg.background !== "none") {
    lines.push(`  <rect width="${cfg.width}" height="${cfg.height}" fill="${cfg.background}" />`);
  }

  for (let passIdx = 0; passIdx < cfg.passes.length; passIdx++) {
    const pass = cfg.passes[passIdx]!;
    const pts: string[] = [];
    // continuousTheta: each pass continues from where the previous ended.
    // This models the real machine — the table keeps rotating between colour
    // changes, so each pass lands at a different canvas angle.
    const thetaBase = cfg.continuousTheta ? passIdx * cfg.steps * speed : 0;
    let theta = thetaBase;
    for (let i = 0; i <= cfg.steps; i++) {
      const p = getPenPosition(theta, pass.phaseOffset, pass.orbits, pass.tableTeeth);
      const x = (cx + p.x).toFixed(2);
      const y = (cy + p.y).toFixed(2);
      pts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`);
      theta += speed;
    }
    lines.push(`  <path d="${pts.join(" ")}" fill="none" stroke="${pass.color}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round" opacity="${cfg.opacity}" />`);
  }

  lines.push("</svg>");
  return lines.join("\n");
}

// ── CSV tracking ────────────────────────────────────────────

const csvFile = `${outDir}/experiments.csv`;
const csvHeader = [
  "id", "timestamp", "target", "mode",
  "steps", "passes", "colors", "opacity",
  "drive_teeth", "x_arm_gears", "y_arm_gears", "table_teeth",
  "speed", "line_width", "width", "height", "background",
  "notes", "svg_file", "png_file",
].join(",");

function nextExperimentId(): number {
  if (!existsSync(csvFile)) return 1;
  const content = readFileSync(csvFile, "utf-8").trim();
  const rows = content.split("\n").slice(1);
  if (rows.length === 0) return 1;
  return Math.max(...rows.map(r => parseInt(r.split(",")[0]!) || 0)) + 1;
}

function fmtConfigForCsv(): { xGears: string; yGears: string } {
  if (cfg.spiral) {
    const desc = `g=${cfg.spiral.growth} + ` + cfg.spiral.wobbles
      .map(w => `A${w.amplitude}/f${w.freq}/φ${w.phase.toFixed(2)}`)
      .join(" + ");
    return { xGears: `spiral: ${desc}`, yGears: "—" };
  }
  if (cfg.epicyclic) {
    const desc = cfg.epicyclic.orbits
      .map(o => `ω${o.speed}/R${o.radius}/φ${o.phase.toFixed(2)}`)
      .join(" → ");
    return { xGears: `epicyclic: ${desc}`, yGears: "—" };
  }
  if (cfg.machine) {
    const fmt = (arm: MachineConfig["xArm"]) => arm.gears
      .map(g => `${g.teeth}T/R${g.crankRadius}/φ${g.phase.toFixed(2)}`)
      .join(" → ");
    return { xGears: fmt(cfg.machine.xArm), yGears: fmt(cfg.machine.yArm) };
  }
  return { xGears: "—", yGears: "—" };
}

function csvVal(v: string | number): string {
  const s = String(v);
  return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

function logExperiment(id: number, svgFile: string, pngFile: string, notes: string): void {
  // Create file with header if needed
  if (!existsSync(csvFile)) {
    writeFileSync(csvFile, `${csvHeader}\n`);
  }

  const colors = cfg.passes.map(p => p.color).join(";");
  const { xGears, yGears } = fmtConfigForCsv();
  const mode = isSpiral(cfg) ? "spiral" : isEpicyclic(cfg) ? "epicyclic" : "linear";

  const row = [
    id,
    new Date().toISOString(),
    csvVal(cfg.target),
    mode,
    cfg.steps,
    cfg.passes.length,
    csvVal(colors),
    cfg.opacity,
    getDriveTeeth(cfg),
    csvVal(xGears),
    csvVal(yGears),
    getTableTeeth(cfg) || 0,
    getSpeed(cfg),
    cfg.lineWidth,
    cfg.width,
    cfg.height,
    csvVal(cfg.background),
    csvVal(notes),
    svgFile,
    pngFile,
  ].join(",");

  writeFileSync(csvFile, `${readFileSync(csvFile, "utf-8")}${row}\n`);
}

// ── PNG conversion ──────────────────────────────────────────

function tryConvertPng(svgPath: string, pngPath: string): boolean {
  const dim = Math.max(cfg.width, cfg.height);
  try {
    execSync(`convert "${svgPath}" -resize ${dim}x${dim} "${pngPath}" 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch { /* ignore */ }
  try {
    execSync(`inkscape "${svgPath}" --export-type=png --export-filename="${pngPath}" --export-width=${dim} 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch { /* ignore */ }
  return false;
}

// ── ANSI helpers ────────────────────────────────────────────

const a = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", red: "\x1b[31m", white: "\x1b[97m",
};
const bold  = (s: string) => `${a.bold}${s}${a.reset}`;
const dim   = (s: string) => `${a.dim}${s}${a.reset}`;
const cyan  = (s: string) => `${a.cyan}${s}${a.reset}`;
const green = (s: string) => `${a.green}${s}${a.reset}`;
const yellow = (s: string) => `${a.yellow}${s}${a.reset}`;
const blue  = (s: string) => `${a.blue}${s}${a.reset}`;

function fmtSteps(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

function colorToAnsi(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  if (r > 0.6 && g < 0.4) return 196;
  if (b > 0.5 && g > 0.5) return 51;
  if (r > 0.6 && g > 0.4 && b < 0.3) return 214;
  return 255;
}

// ── Main ────────────────────────────────────────────────────

const notesIdx = process.argv.indexOf("--notes");
const notes = notesIdx !== -1 ? (process.argv[notesIdx + 1] ?? "") : "";

const expId = nextExperimentId();
const padId = String(expId).padStart(4, "0");

const divider = dim("─".repeat(56));
console.log(divider);
console.log(`${bold(cyan(`Experiment #${expId}`))}  ${dim(new Date().toLocaleTimeString())}`);
if (notes) console.log(`${yellow("📝")} ${yellow(notes)}`);
console.log(divider);

const modeLabel = isSpiral(cfg) ? `${a.magenta}SPIRAL${a.reset}` : isEpicyclic(cfg) ? `${a.magenta}EPICYCLIC${a.reset}` : "LINEAR";
console.log(`  ${dim("mode")}    ${bold(modeLabel)}    ${dim("canvas")} ${cfg.width}×${cfg.height}`);
console.log(`  ${dim("steps")}   ${bold(fmtSteps(cfg.steps))}    ${dim("table")}  ${getTableTeeth(cfg) ? `${getTableTeeth(cfg)}T → ${tableRotationDeg(cfg)}` : blue("off")}`);
console.log(`  ${dim("passes")}  ${bold(String(cfg.passes.length))} ${cfg.passes.map(p => `${a.bold}\x1b[38;5;${colorToAnsi(p.color)}m●${a.reset}`).join(" ")}    ${dim("opacity")} ${cfg.opacity}    ${dim("lw")} ${cfg.lineWidth}`);

if (isSpiral(cfg)) {
  console.log(`  ${dim("growth")}  ${cfg.spiral.growth}px/rad`);
  if (cfg.spiral.orbit) {
    const o = cfg.spiral.orbit;
    console.log(`  ${dim("orbit")}   R=${o.radius} ω=${o.speed} φ=${o.phase.toFixed(2)}`);
  }
  for (let i = 0; i < cfg.spiral.wobbles.length; i++) {
    const w = cfg.spiral.wobbles[i]!;
    console.log(`  ${dim(`wobble${i + 1}`)}  A=${w.amplitude} f=${w.freq} φ=${w.phase.toFixed(2)}`);
  }
} else if (isEpicyclic(cfg)) {
  for (let i = 0; i < cfg.epicyclic.orbits.length; i++) {
    const o = cfg.epicyclic.orbits[i]!;
    const dir = o.speed < 0 ? "↻" : "↺";
    console.log(`  ${dim(`orbit${i + 1}`)}  ${dir} ω=${o.speed} R=${o.radius} φ=${o.phase.toFixed(2)}`);
  }
} else if (cfg.machine) {
  console.log(`  ${dim("X arm")}   ${cfg.machine.xArm.gears.map(g => `${g.teeth}T/R${g.crankRadius}`).join(cyan(" → "))}`);
  console.log(`  ${dim("Y arm")}   ${cfg.machine.yArm.gears.map(g => `${g.teeth}T/R${g.crankRadius}`).join(cyan(" → "))}`);
}

console.log(divider);

const t0 = performance.now();
process.stdout.write("  Rendering…");
const svg = renderSVG();
const elapsed = (performance.now() - t0).toFixed(0);
process.stdout.write(`\r  ${green("✓")} Done in ${bold(`${elapsed}ms`)}  ${dim(`(${(svg.length / 1024).toFixed(0)} KB SVG)`)}\n`);

const svgName = `exp-${padId}.svg`;
const pngName = `exp-${padId}.png`;
const svgPath = `${outDir}/${svgName}`;
const pngPath = `${outDir}/${pngName}`;

writeFileSync(svgPath, svg);
writeFileSync(`${outDir}/experiment.svg`, svg);

process.stdout.write("  Converting PNG…");
const hasPng = tryConvertPng(svgPath, pngPath);
if (hasPng) {
  try { execSync(`cp "${pngPath}" "${outDir}/experiment.png"`, { stdio: "ignore" }); } catch { /* ignore */ }
  process.stdout.write(`\r  ${green("✓")} PNG  → ${cyan(pngPath)}\n`);
} else {
  process.stdout.write(`\r  ${dim("○")} PNG conversion unavailable\n`);
}
console.log(`  ${dim("SVG")}  → ${cyan(svgPath)}`);

logExperiment(expId, svgName, hasPng ? pngName : "", notes);
console.log(`  ${dim("CSV")}  → ${cyan(csvFile)}`);
console.log(divider);

if (process.argv.includes("--open")) {
  try {
    execSync(`xdg-open ${svgPath} 2>/dev/null || open ${svgPath} 2>/dev/null`, { stdio: "ignore" });
  } catch { /* ignore */ }
}
