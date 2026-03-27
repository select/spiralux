/**
 * render.ts — headless SVG renderer for the cycloid machine.
 *
 * Usage:
 *   npx tsx scripts/render.ts              # renders output/experiment.svg
 *   npx tsx scripts/render.ts --open       # renders + opens in browser
 *
 * Reads config from scripts/params.ts — edit that file between runs.
 */

import { writeFileSync, mkdirSync } from "node:fs";
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

    lines.push(`  <path d="${points.join(" ")}" fill="none" stroke="${pass.color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />`);
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

// ---- Main ----
console.log("Rendering with:");
console.log(`  Steps: ${steps}`);
console.log(`  Passes: ${passes.length} (${passes.map(p => p.color).join(", ")})`);
console.log(`  Drive: ${machine.driveTeeth}T`);
console.log(`  X arm: ${machine.xArm.gears.map(g => `${g.teeth}T/R${g.crankRadius}`).join(" → ")}`);
console.log(`  Y arm: ${machine.yArm.gears.map(g => `${g.teeth}T/R${g.crankRadius}`).join(" → ")}`);
console.log(`  Table: ${machine.tableTeeth || "off"}`);
console.log(`  Size: ${width}×${height}`);

const t0 = performance.now();
const svg = renderSVG();
const elapsed = (performance.now() - t0).toFixed(0);

const outFile = `${outDir}/experiment.svg`;
writeFileSync(outFile, svg);
console.log(`\nDone in ${elapsed}ms → ${outFile} (${(svg.length / 1024).toFixed(0)} KB)`);

// Optionally open
if (process.argv.includes("--open")) {
  try {
    execSync(`xdg-open ${outFile} 2>/dev/null || open ${outFile} 2>/dev/null`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}
