/**
 * Canvas renderer — draws the spiral trace progressively
 * with support for dynamic color generation.
 */

import type { MachineConfig } from "./engine";
import { penPosition } from "./engine";
import type { ColorGeneratorState } from "./colors";
import { getColor } from "./colors";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: MachineConfig;
  private colorState: ColorGeneratorState;

  private theta = 0;
  private animId: number | null = null;
  private running = false;

  private totalRadians = 0;
  private readonly maxRadians = 200 * Math.PI;

  private onStopCallback: (() => void) | null = null;
  private onFrameCallback: ((theta: number) => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    config: MachineConfig,
    colorState: ColorGeneratorState,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.config = config;
    this.colorState = colorState;
    this.fitCanvas();
    window.addEventListener("resize", () => this.fitCanvas());
  }

  setConfig(config: MachineConfig) { this.config = config; }
  setColorState(state: ColorGeneratorState) { this.colorState = state; }
  onStop(cb: () => void) { this.onStopCallback = cb; }
  onFrame(cb: (theta: number) => void) { this.onFrameCallback = cb; }
  getTheta(): number { return this.theta; }
  isRunning() { return this.running; }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  pause() {
    this.running = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  toggle() { if (this.running) { this.pause(); } else { this.start(); } }

  clear() {
    this.theta = 0;
    this.totalRadians = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  reset(config: MachineConfig) {
    this.pause();
    this.config = config;
    this.clear();
  }

  /**
   * Draw `steps` iterations synchronously — used for live preview mode.
   * Advances theta so that a subsequent start() continues seamlessly.
   */
  drawPreview(steps = 10_000) {
    this.pause();
    this.clear();

    const cfg = this.config;
    const cs = this.colorState;
    const ctx = this.ctx;
    const cx = this.canvas.getBoundingClientRect().width / 2;
    const cy = this.canvas.getBoundingClientRect().height / 2;

    ctx.lineWidth = cfg.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let i = 0; i < steps; i++) {
      const prevPos = penPosition(cfg, this.theta);
      this.theta += cfg.speed;
      this.totalRadians += cfg.speed;
      const pos = penPosition(cfg, this.theta);
      const color = getColor(cs, this.theta);

      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx + prevPos.x, cy + prevPos.y);
      ctx.lineTo(cx + pos.x, cy + pos.y);
      ctx.stroke();
    }
  }

  getCanvasDataURL(): string {
    return this.canvas.toDataURL("image/png");
  }

  private fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop = () => {
    if (!this.running) return;

    const stepsPerFrame = 20;
    const cfg = this.config;
    const ctx = this.ctx;
    const cx = this.canvas.getBoundingClientRect().width / 2;
    const cy = this.canvas.getBoundingClientRect().height / 2;

    ctx.lineWidth = cfg.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let i = 0; i < stepsPerFrame; i++) {
      const prevPos = penPosition(cfg, this.theta);
      this.theta += cfg.speed;
      this.totalRadians += cfg.speed;
      const pos = penPosition(cfg, this.theta);
      const color = getColor(this.colorState, this.theta);

      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx + prevPos.x, cy + prevPos.y);
      ctx.lineTo(cx + pos.x, cy + pos.y);
      ctx.stroke();
    }

    this.onFrameCallback?.(this.theta);

    if (this.totalRadians < this.maxRadians) {
      this.animId = requestAnimationFrame(this.loop);
    } else {
      this.running = false;
      this.onStopCallback?.();
    }
  };
}
