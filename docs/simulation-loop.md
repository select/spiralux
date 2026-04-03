# Simulation Loop — Replicating a Target Pattern

This guide explains how to use the headless renderer to iteratively match a real drawing machine output.

## Quick Start

```bash
# 1. Edit parameters
vim scripts/params.ts

# 2. Render SVG (auto-saves numbered experiment + logs to CSV)
pnpm render

# 3. Compare output/experiment.svg to your target image
# 4. Tweak params.ts, repeat
```

## Files

| File | Purpose |
|------|---------|
| `scripts/params.ts` | **Edit this** — machine config, colors, passes, steps |
| `scripts/render.ts` | Headless SVG renderer (reads params.ts) |
| `output/experiment.svg` | Latest output (always overwritten) |
| `output/experiment.png` | Latest output as PNG (if converter available) |
| `output/exp-NNNN.svg` | Numbered experiment archive (never overwritten) |
| `output/exp-NNNN.png` | Numbered experiment PNG archive |
| `output/experiments.csv` | **Experiment log** — all params + metadata per run |

## Experiment Tracking

Every `pnpm render` automatically:

1. **Saves a numbered copy** — `output/exp-0001.svg`, `exp-0002.svg`, etc. These are never overwritten.
2. **Converts to PNG** — if ImageMagick `convert` or `inkscape` is available.
3. **Appends to `output/experiments.csv`** — a full record of every experiment with all parameters.
4. **Overwrites `output/experiment.svg`** — the "latest" file for quick viewing.

### CSV Columns

| Column | Description |
|--------|-------------|
| `id` | Auto-incrementing experiment number |
| `timestamp` | ISO 8601 render time |
| `steps` | Motor angle steps per pass |
| `passes` | Number of color passes |
| `colors` | Semicolon-separated hex colors |
| `drive_teeth` | Motor drive gear teeth |
| `x_arm_gears` | X arm gear chain: `60T/R200/φ0.00 → 30T/R100/φ1.57` |
| `y_arm_gears` | Y arm gear chain (same format) |
| `table_teeth` | Paper table gear teeth (0 = off) |
| `speed` | Motor angle increment per step (radians) |
| `line_width` | Stroke width in px |
| `width` / `height` | SVG canvas dimensions |
| `background` | Background color or "none" |
| `notes` | Optional freeform notes (via `--notes`) |
| `svg_file` | Filename of the numbered SVG |
| `png_file` | Filename of the numbered PNG (if converted) |

### Adding Notes

```bash
pnpm render -- --notes "trying wider lobes with crankRadius 250"
```

### Reviewing Past Experiments

**In a new session**, read the CSV to see what's been tried:

```bash
# View all experiments
cat output/experiments.csv | column -t -s,

# Or just the key columns
cut -d, -f1,3,6,7,8,9,15 output/experiments.csv | column -t -s,
```

**For the AI agent**: always read `output/experiments.csv` at the start of a session to understand what's been tried, what worked, and what to try next. Look at the `notes` column and compare PNG images of promising experiments to the target.

## How `params.ts` Works

### Machine config

```typescript
export const machine: MachineConfig = {
  driveTeeth: 20,           // Motor gear — higher = faster all gears spin
  xArm: { gears: [...] },  // Horizontal slide arm gear chain
  yArm: { gears: [...] },  // Vertical slide arm gear chain
  tableTeeth: 190,          // Paper table gear (0 = no rotation)
  speed: 0.015,             // Motor angle increment per step (radians)
  lineWidth: 0.4,
};
```

Each gear in a chain:
```typescript
{ teeth: 60, crankRadius: 150, phase: 0 }
//  ↑ speed ratio    ↑ amplitude     ↑ initial angle
```

- **teeth** — determines rotation speed via belt ratio: `speed = prevSpeed × (prevTeeth / thisTeeth)`
- **crankRadius** — how far the crank pin is from center (0 = gear contributes nothing)
- **phase** — starting angle offset in radians

### Multi-pass rendering

The real machine draws one color at a time. Each pass uses the same gear config but with a phase offset:

```typescript
export const passes = [
  { color: "#d64078", phaseOffset: 0 },              // Pink
  { color: "#3fa8c8", phaseOffset: (2 * Math.PI) / 3 }, // Blue, rotated 120°
  { color: "#d07030", phaseOffset: (4 * Math.PI) / 3 }, // Orange, rotated 240°
];
```

`phaseOffset` is added to every gear's phase for that pass.

### Other settings

```typescript
export const steps = 80_000;          // More steps = denser lines
export const width = 1200;            // SVG canvas size
export const height = 1200;
export const background = "#f0f0ec";  // "none" for transparent
```

## Experiment Loop

Renders take ~150ms. Experiments are nearly free. **Stop thinking, start rendering.**

### The Loop (run forever until interrupted)

Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch): autonomous experimentation with fast iteration cycles. The human may be away — never pause to ask if you should continue.

```
LOOP FOREVER:
  1. Edit scripts/params.ts — ONE change per experiment
  2. pnpm render -- --notes "short description of what changed"
  3. Look at the output PNG — compare to target image
  4. If closer to target → KEEP (git commit -am "exp: description")
     If same or worse  → DISCARD (git checkout scripts/params.ts)
  5. Go to 1. Do NOT stop to ask the human.
```

### Rules

- **Never over-analyze.** If unsure whether a change will help, just render it and look. The experiment is free (~150ms).
- **One change at a time** — so you know what helped or hurt.
- **Use low steps first** (5k–10k) for fast shape iteration. Increase to 40k–80k only for final density tuning.
- **Always add `--notes`** — future sessions need to know what each experiment tried.
- **If stuck**: re-read the target image, try something radically different, combine ideas from near-misses. Read the gear ratio table below for inspiration.
- **Crashes**: fix the obvious bug and re-run. Don't spiral on it.

### Phases (rough order, but skip around freely)

**Phase 1 — Raw shape** (table off, single pass, low steps)
```typescript
export const passes = [{ color: "#333", phaseOffset: 0 }];
export const steps = 5_000;
tableTeeth: 0,  // no paper rotation — see the raw curve
```
Tweak gear teeth/radii until the basic shape is right. This is where most experiments happen.

**Phase 2 — Fill density** (turn on table, increase steps)
```typescript
tableTeeth: 190,     // higher = slower rotation = denser fill
export const steps = 40_000;
```

**Phase 3 — Color passes** (3 passes with 120° offsets)
```typescript
export const passes = [
  { color: "#d64078", phaseOffset: 0 },
  { color: "#3fa8c8", phaseOffset: (2 * Math.PI) / 3 },
  { color: "#d07030", phaseOffset: (4 * Math.PI) / 3 },
];
```

**Phase 4 — Fine-tune** (orientation, line weight, colors, density)

### What to tune (priority order)

1. **Gear teeth** → lobe count and shape (most important knob)
2. **crankRadius** → amplitude / lobe size
3. **Number of gears per arm** → adds harmonics for complex shapes
4. **tableTeeth** → fill density (0 = off for raw shape iteration)
5. **phase** → rotates/orients the pattern
6. **passes / colors** → save for last
7. **steps** → more = denser lines (keep low during iteration)

## Understanding Gear Ratios

With `driveTeeth: 20`:

| Gear teeth | Effective speed | Notes |
|------------|----------------|-------|
| 20 | 1.0× | Same speed as motor |
| 40 | 0.5× | Half speed |
| 60 | 0.33× | Third speed |
| 10 | 2.0× | Double speed |

In a chain, each gear's speed depends on the previous:
```
drive(20T) → gear1(60T) → gear2(30T)
  gear1 speed = 20/60 = 0.33×
  gear2 speed = 0.33 × (60/30) = 0.67×
```

## Tips

- **Experiments are free** — when in doubt, just render it
- Start with **1 gear per arm** — simpler to reason about
- Keep `speed` between 0.005–0.03 for reasonable resolution
- SVG files can be opened in any browser for inspection
- Use `pnpm render:open` to auto-open the SVG after rendering
- **Always add `--notes`** to document what you're trying
- Review `output/experiments.csv` before starting a new session
- **Never pause to ask the human** — they might be asleep. Keep looping.
