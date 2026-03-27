# Simulation Loop — Replicating a Target Pattern

This guide explains how to use the headless renderer to iteratively match a real cycloid drawing machine output.

## Quick Start

```bash
# 1. Edit parameters
vim scripts/params.ts

# 2. Render SVG
pnpm render

# 3. Compare output/experiment.svg to your target image
# 4. Tweak params.ts, repeat
```

## Files

| File | Purpose |
|------|---------|
| `scripts/params.ts` | **Edit this** — machine config, colors, passes, steps |
| `scripts/render.ts` | Headless SVG renderer (reads params.ts) |
| `output/experiment.svg` | Generated output (gitignored) |

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

## Iteration Strategy

### Step 1: Get the basic shape right

Set `tableTeeth: 0` (no paper rotation) and use a single pass to see the raw curve shape:

```typescript
export const passes = [
  { color: "#333", phaseOffset: 0 },
];
export const steps = 5_000;  // Low steps for fast iteration
```

Tweak gear teeth ratios until the lobe count and proportions match.

**Key insight:** The number of lobes comes from the ratio of X arm speed to Y arm speed. For 3 lobes, try ratios near 3:2 or 3:1.

### Step 2: Fill the lobes

Re-enable paper rotation (`tableTeeth > 0`). A slowly rotating table sweeps the curve around, filling the lobes with dense lines:

```typescript
tableTeeth: 190,    // Higher = slower table rotation = denser fill
```

Increase `steps` to 40k–80k to see the full density.

### Step 3: Match the orientation

Adjust gear `phase` values to rotate the overall pattern.

### Step 4: Add color passes

Switch back to multi-pass with 120° offsets:

```typescript
export const passes = [
  { color: "#d64078", phaseOffset: 0 },
  { color: "#3fa8c8", phaseOffset: (2 * Math.PI) / 3 },
  { color: "#d07030", phaseOffset: (4 * Math.PI) / 3 },
];
```

### Step 5: Fine-tune

- **Lobe size** → change `crankRadius`
- **Lobe shape** → add a second gear to an arm
- **Line density** → increase `steps` and/or tweak `tableTeeth`
- **Line weight** → change `lineWidth`
- **Colors** → adjust hex values and `opacity` in render.ts

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

- Start with **1 gear per arm** — simpler to reason about
- Keep `speed` between 0.005–0.03 for reasonable resolution
- SVG files can be opened in any browser for inspection
- The render takes ~100–200ms so iteration is fast
- Use `pnpm render:open` to auto-open the SVG after rendering
