<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, toRaw } from "vue";
import { config, motorTheta, running } from "../store";
import { gearSpeeds, penPosition, type GearArm } from "../engine";

const canvasEl = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let animId: number | null = null;

const X_COLOR = "#fb7185";
const Y_COLOR = "#38bdf8";

function fitCanvas() {
  const c = canvasEl.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cssProp(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function draw() {
  const c = canvasEl.value;
  if (!c || !ctx) return;
  const w = c.getBoundingClientRect().width;
  const h = c.getBoundingClientRect().height;
  const theta = motorTheta.value;
  const cfg = toRaw(config);

  ctx.clearRect(0, 0, w, h);

  // Layout: left side = gear chains, right side = paper table
  const tableR = Math.min(h * 0.4, w * 0.18);
  const tableCX = w - tableR - 20;
  const tableCY = h / 2;

  // Draw paper table
  drawTable(tableCX, tableCY, tableR, theta, cfg.driveTeeth, cfg.tableTeeth);

  // Pen position on table
  const pen = penPosition(cfg, theta);
  const penScale = tableR / maxArmReach(cfg.xArm, cfg.yArm);
  const penOnTableX = tableCX + pen.x * penScale;
  const penOnTableY = tableCY + pen.y * penScale;

  // Draw gear chains
  const chainAreaW = w - tableR * 2 - 60;
  const chainX = 20;

  // X arm chain (top half)
  drawGearChain(
    cfg.xArm, cfg.driveTeeth, theta,
    chainX, 10, chainAreaW, h / 2 - 15,
    X_COLOR, "X Arm"
  );

  // Y arm chain (bottom half)
  drawGearChain(
    cfg.yArm, cfg.driveTeeth, theta,
    chainX, h / 2 + 5, chainAreaW, h / 2 - 15,
    Y_COLOR, "Y Arm"
  );

  // Draw connection lines from chains to table
  const xArmEndX = chainX + chainAreaW;
  const xArmEndY = h / 4;
  const yArmEndX = chainX + chainAreaW;
  const yArmEndY = h * 3 / 4;

  // X arm → pen (horizontal push)
  ctx.beginPath();
  ctx.moveTo(xArmEndX, xArmEndY);
  ctx.lineTo(penOnTableX, penOnTableY);
  ctx.strokeStyle = X_COLOR + "40";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Y arm → pen (vertical push)
  ctx.beginPath();
  ctx.moveTo(yArmEndX, yArmEndY);
  ctx.lineTo(penOnTableX, penOnTableY);
  ctx.strokeStyle = Y_COLOR + "40";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pen dot
  ctx.beginPath();
  ctx.arc(penOnTableX, penOnTableY, 6, 0, Math.PI * 2);
  const accent = cssProp("--accent", "220 60 90");
  ctx.fillStyle = `rgba(${accent} / 0.25)`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(penOnTableX, penOnTableY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${accent})`;
  ctx.fill();
}

function drawTable(cx: number, cy: number, r: number, theta: number, driveTeeth: number, tableTeeth: number) {
  if (!ctx) return;

  // Table circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = cssProp("--text-muted", "100 100 130") ;
  ctx.strokeStyle = `rgba(${cssProp("--text-muted", "100 100 130")} / 0.3)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Table label
  ctx.font = "9px system-ui, sans-serif";
  ctx.fillStyle = `rgba(${cssProp("--text-muted", "100 100 130")} / 0.6)`;
  ctx.textAlign = "center";
  ctx.fillText("Paper Table", cx, cy - r - 4);

  if (tableTeeth > 0) {
    // Rotation indicator
    const tableSpeed = driveTeeth / tableTeeth;
    const angle = tableSpeed * theta;
    const ix = cx + r * Math.cos(angle);
    const iy = cy + r * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(ix, iy, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cssProp("--text-muted", "100 100 130")} / 0.5)`;
    ctx.fill();

    // Teeth label
    ctx.fillStyle = `rgba(${cssProp("--text-muted", "100 100 130")} / 0.4)`;
    ctx.fillText(`${tableTeeth}T`, cx, cy + r + 12);
  } else {
    ctx.fillStyle = `rgba(${cssProp("--text-muted", "100 100 130")} / 0.3)`;
    ctx.fillText("fixed", cx, cy + r + 12);
  }

  // Cross-hair on table
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx + 6, cy);
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx, cy + 6);
  ctx.strokeStyle = `rgba(${cssProp("--text-muted", "100 100 130")} / 0.2)`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGearChain(
  arm: GearArm, driveTeeth: number, theta: number,
  x: number, y: number, w: number, h: number,
  color: string, label: string,
) {
  if (!ctx) return;
  const gears = arm.gears;
  const speeds = gearSpeeds(arm, driveTeeth);
  const n = gears.length;
  if (n === 0) return;

  // Space gears evenly across the area
  const gearSpacing = w / (n + 0.5);
  const maxTeeth = Math.max(...gears.map(g => g.teeth));
  const maxGearR = Math.min(h * 0.35, gearSpacing * 0.4);

  // Label
  ctx.font = "9px system-ui, sans-serif";
  ctx.fillStyle = color + "80";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y + 10);

  for (let i = 0; i < n; i++) {
    const gear = gears[i]!;
    const speed = speeds[i]!;
    const cx = x + gearSpacing * (i + 0.5);
    const cy = y + h / 2;
    const gearR = (gear.teeth / maxTeeth) * maxGearR;
    const angle = speed * theta + gear.phase;

    // Belt to next gear
    if (i < n - 1) {
      const nextCx = x + gearSpacing * (i + 1.5);
      ctx.beginPath();
      ctx.moveTo(cx + gearR, cy);
      ctx.lineTo(nextCx - (gears[i + 1]!.teeth / maxTeeth) * maxGearR, cy);
      ctx.strokeStyle = "#ef444460";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Belt dots
      ctx.beginPath();
      ctx.arc(cx + gearR, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }

    // Gear disc
    ctx.beginPath();
    ctx.arc(cx, cy, gearR, 0, Math.PI * 2);
    ctx.strokeStyle = color + "50";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gear teeth marks (visual only)
    const toothCount = Math.min(gear.teeth, 40); // cap visual teeth
    for (let t = 0; t < toothCount; t++) {
      const ta = (t / toothCount) * Math.PI * 2 + angle;
      const tx = cx + gearR * Math.cos(ta);
      const ty = cy + gearR * Math.sin(ta);
      ctx.beginPath();
      ctx.arc(tx, ty, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = color + "30";
      ctx.fill();
    }

    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color + "60";
    ctx.fill();

    // Crank arm
    if (gear.crankRadius > 0) {
      const crankScale = gearR / Math.max(gear.teeth * 0.8, 1);
      const crankR = Math.min(gear.crankRadius * crankScale, gearR * 0.9);
      const crankX = cx + crankR * Math.cos(angle);
      const crankY = cy + crankR * Math.sin(angle);

      // Arm line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(crankX, crankY);
      ctx.strokeStyle = color + "90";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crank pin
      ctx.beginPath();
      ctx.arc(crankX, crankY, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Labels
    ctx.font = "8px system-ui, sans-serif";
    ctx.fillStyle = color + "90";
    ctx.textAlign = "center";
    ctx.fillText(`${gear.teeth}T`, cx, cy - gearR - 4);
    ctx.fillStyle = color + "60";
    ctx.fillText(`×${speed.toFixed(2)}`, cx, cy + gearR + 10);
  }
}

function maxArmReach(xArm: GearArm, yArm: GearArm): number {
  const xMax = xArm.gears.reduce((s, g) => s + g.crankRadius, 0);
  const yMax = yArm.gears.reduce((s, g) => s + g.crankRadius, 0);
  return Math.max(Math.max(xMax, yMax), 1);
}

function animate() {
  draw();
  if (running.value) {
    animId = requestAnimationFrame(animate);
  }
}

watch([motorTheta, config], () => { if (!running.value) draw(); }, { deep: true });
watch(running, (isRunning) => {
  if (isRunning) {
    if (animId !== null) cancelAnimationFrame(animId);
    animate();
  }
});

onMounted(() => {
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  draw();
  if (running.value) animate();
});

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId);
  window.removeEventListener("resize", fitCanvas);
});
</script>

<template>
  <div class="w-full h-full relative">
    <canvas ref="canvasEl" class="absolute inset-0 w-full h-full" />
    <span class="absolute top-2 left-3 text-[10px] font-semibold uppercase tracking-widest text-muted pointer-events-none">
      Machine
    </span>
  </div>
</template>
