/**
 * render.ts — headless SVG renderer for the cycloid machine.
 *
 * Usage:
 *   npx tsx scripts/render.ts              # renders output/experiment.svg
 *   npx tsx scripts/render.ts --open       # renders + opens in browser
 *
 * Reads config from scripts/params.ts — edit that file between runs.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { penPosition } from "../src/engine";
import type { MachineConfig } from "../src/engine";
import { machine, passes, steps, width, height, background, lineWidth } from "./params";

const outDir = "output";
mkdirSync(outDir, { recursive: true });

function renderSVG(): string {
  const cx = width / 2;
  const cy = height / 2;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);

  if (background !== "none") {
    lines.push(`  <rect width="${width}" height="${height}" fill="${background}" />`);
  }

  for (const pass of passes) {
    // Build a config with phaseOffset applied to every gear
    const cfg = applyPhaseOffset(machine, pass.phaseOffset);

    // Trace the path
    const points: string[] = [];
    let theta = 0;
    for (let i = 0; i <= steps; i++) {
      const p = penPosition(cfg, theta);
      const x = (cx + p.x).toFixed(2);
      const y = (cy + p.y).toFixed(2);
      if (i === 0) {
        points.push(`M${x},${y}`);
      } else {
        points.push(`L${x},${y}`);
      }
      theta += cfg.speed;
    }

    lines.push(`  <path d="${points.join(" ")}" fill="none" stroke="${pass.color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.5" />`);
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * Clone the machine config with phaseOffset added to all gear phases.
 */
function applyPhaseOffset(cfg: MachineConfig, offset: number): MachineConfig {
  if (offset === 0) return cfg;
  return {
    ...cfg,
    xArm: {
      gears: cfg.xArm.gears.map(g => ({ ...g, phase: g.phase + offset })),
    },
    yArm: {
      gears: cfg.yArm.gears.map(g => ({ ...g, phase: g.phase + offset })),
    },
  };
}

// ---- Experiment tracking ----

const csvFile = `${outDir}/experiments.csv`;
const csvHeader = "id,timestamp,steps,passes,colors,drive_teeth,x_arm_gears,y_arm_gears,table_teeth,speed,line_width,width,height,background,notes,svg_file,png_file";

/** Get the next experiment ID by scanning existing CSV rows */
function nextExperimentId(): number {
  if (!existsSync(csvFile)) return 1;
  const content = readFileSync(csvFile, "utf-8").trim();
  const rows = content.split("\n").slice(1); // skip header
  if (rows.length === 0) return 1;
  const lastId = Math.max(...rows.map(r => parseInt(r.split(",")[0]!) || 0));
  return lastId + 1;
}

/** Format gear array as compact string: "60T/R200/φ0 → 30T/R100/φ1.57" */
function fmtGears(arm: MachineConfig["xArm"]): string {
  return arm.gears
    .map(g => `${g.teeth}T/R${g.crankRadius}/φ${g.phase.toFixed(2)}`)
    .join(" → ");
}

/** Escape a value for CSV (wrap in quotes if it contains commas) */
function csvVal(v: string | number): string {
  const s = String(v);
  return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Append one row to experiments.csv */
function logExperiment(id: number, svgFile: string, pngFile: string, notes: string): void {
  if (!existsSync(csvFile)) {
    writeFileSync(csvFile, csvHeader + "\n");
  }
  const colors = passes.map(p => p.color).join(";");
  const row = [
    id,
    new Date().toISOString(),
    steps,
    passes.length,
    csvVal(colors),
    machine.driveTeeth,
    csvVal(fmtGears(machine.xArm)),
    csvVal(fmtGears(machine.yArm)),
    machine.tableTeeth || 0,
    machine.speed,
    lineWidth,
    width,
    height,
    csvVal(background),
    csvVal(notes),
    svgFile,
    pngFile,
  ].join(",");
  writeFileSync(csvFile, readFileSync(csvFile, "utf-8") + row + "\n");
}

/** Try to convert SVG → PNG via ImageMagick or Inkscape */
function tryConvertPng(svgPath: string, pngPath: string): boolean {
  try {
    execSync(`convert "${svgPath}" -resize 1600x1600 "${pngPath}" 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch { /* ignore */ }
  try {
    execSync(`inkscape "${svgPath}" --export-type=png --export-filename="${pngPath}" --export-width=1600 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch { /* ignore */ }
  return false;
}

// ---- ANSI helpers ----
const c = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  cyan:  "\x1b[36m",
  green: "\x1b[32m",
  yellow:"\x1b[33m",
  blue:  "\x1b[34m",
  magenta:"\x1b[35m",
  red:   "\x1b[31m",
  white: "\x1b[97m",
};
const bold  = (s: string) => `${c.bold}${s}${c.reset}`;
const dim   = (s: string) => `${c.dim}${s}${c.reset}`;
const cyan  = (s: string) => `${c.cyan}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow= (s: string) => `${c.yellow}${s}${c.reset}`;
const blue  = (s: string) => `${c.blue}${s}${c.reset}`;

function fmtSteps(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

function tableRotationDeg(): string {
  if (!machine.tableTeeth) return "off";
  const totalTheta = steps * machine.speed;
  const rotRad = totalTheta * (machine.driveTeeth / machine.tableTeeth);
  const deg = (rotRad * 180 / Math.PI) % 360;
  return `${deg.toFixed(0)}° total`;
}

// ---- Main ----

// Accept optional notes via --notes "some text"
const notesIdx = process.argv.indexOf("--notes");
const notes = notesIdx !== -1 ? (process.argv[notesIdx + 1] ?? "") : "";

const expId = nextExperimentId();
const padId = String(expId).padStart(4, "0");

const divider = dim("─".repeat(56));
console.log(divider);
console.log(`${bold(cyan(`Experiment #${expId}`))}  ${dim(new Date().toLocaleTimeString())}`);
if (notes) console.log(`${yellow("📝")} ${yellow(notes)}`);
console.log(divider);
console.log(`  ${dim("steps")}   ${bold(fmtSteps(steps))}    ${dim("drive")}  ${machine.driveTeeth}T    ${dim("canvas")} ${width}×${height}`);
console.log(`  ${dim("passes")}  ${bold(String(passes.length))} ${passes.map(p => `${c.bold}\x1b[38;5;${colorToAnsi(p.color)}m●${c.reset}`).join(" ")}    ${dim("table")}  ${machine.tableTeeth ? `${machine.tableTeeth}T → ${tableRotationDeg()}` : blue("off")}`);
console.log(`  ${dim("X arm")}   ${machine.xArm.gears.map(g => `${g.teeth}T/R${g.crankRadius}`).join(cyan(" → "))}`);
console.log(`  ${dim("Y arm")}   ${machine.yArm.gears.map(g => `${g.teeth}T/R${g.crankRadius}`).join(cyan(" → "))}`);
console.log(divider);

/** Map a hex color to the nearest ANSI 256 color index (rough approximation) */
function colorToAnsi(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  if (r > 0.6 && g < 0.4) return 196; // red/pink
  if (b > 0.5 && g > 0.5) return 51;  // cyan
  if (r > 0.6 && g > 0.4 && b < 0.3) return 214; // orange
  return 255; // white
}

const t0 = performance.now();
process.stdout.write("  Rendering…");
const svg = renderSVG();
const elapsed = (performance.now() - t0).toFixed(0);
process.stdout.write(`\r  ${green("✓")} Done in ${bold(elapsed + "ms")}  ${dim(`(${(svg.length / 1024).toFixed(0)} KB SVG)`)}\n`);

// Save numbered + latest files
const svgName = `exp-${padId}.svg`;
const pngName = `exp-${padId}.png`;
const svgPath = `${outDir}/${svgName}`;
const pngPath = `${outDir}/${pngName}`;
const latestSvg = `${outDir}/experiment.svg`;
const latestPng = `${outDir}/experiment.png`;

writeFileSync(svgPath, svg);
writeFileSync(latestSvg, svg);

process.stdout.write("  Converting PNG…");
const hasPng = tryConvertPng(svgPath, pngPath);
if (hasPng) {
  try { execSync(`cp "${pngPath}" "${latestPng}"`, { stdio: "ignore" }); } catch { /* ignore */ }
  process.stdout.write(`\r  ${green("✓")} PNG  → ${cyan(pngPath)}\n`);
} else {
  process.stdout.write(`\r  ${dim("○")} PNG conversion unavailable (no ImageMagick/Inkscape)\n`);
}
console.log(`  ${dim("SVG")}  → ${cyan(svgPath)}`);

// Log to CSV
logExperiment(expId, svgName, hasPng ? pngName : "", notes);
console.log(`  ${dim("CSV")}  → ${cyan(csvFile)}`);
console.log(divider);

// Optionally open
if (process.argv.includes("--open")) {
  try {
    execSync(`xdg-open ${svgPath} 2>/dev/null || open ${svgPath} 2>/dev/null`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}
