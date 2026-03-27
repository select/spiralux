# agents.md — Cycloid Drawing Machine Simulator

## Project Overview

A browser-based simulator of the Nolan Gandy Cycloid Drawing Machine, built with **Vue 3**, **TypeScript**, **Tailwind CSS v4**, and **Vite**.

The real machine uses belt-connected gears to drive two perpendicular slide arms (X and Y), whose combined linear oscillations move a pen over a rotating paper table, producing complex spirograph patterns.

## Architecture

```
src/
├── main.ts                  # Entry: mount Vue app, load saved theme
├── App.vue                  # Root layout: canvas + sidebar
├── engine.ts                # Mechanical simulation math
├── renderer.ts              # Canvas drawing loop with color generation
├── store.ts                 # Reactive shared state (Vue reactivity)
├── themes.ts                # 5 UI themes via CSS custom properties
├── colors.ts                # 4 color modes: static, gradient, rainbow, palette
├── presets.ts               # 10 curated gear configurations
├── style.css                # Tailwind imports + minimal required CSS
├── env.d.ts                 # Vite/Vue type declarations
└── components/
    ├── CanvasView.vue       # Drawing canvas + machine diagram container
    ├── MachineView.vue      # Animated top-down gear train diagram
    ├── Sidebar.vue          # Orchestrates all control panels
    ├── GearArmControl.vue   # Per-arm gear chain editor (add/remove gears)
    ├── SliderField.vue      # Reusable v-model slider with label + value
    ├── GlobalControls.vue   # Drive teeth, table teeth, speed, line width
    ├── ColorGenerator.vue   # Color mode selector + per-mode options
    ├── PresetSelector.vue   # 10-preset icon grid
    ├── ThemeSwitcher.vue    # 5-theme pill switcher
    └── ActionButtons.vue    # Play/Pause, Clear, Reset, Export PNG, Machine toggle
```

## Mechanical Model (engine.ts)

The simulation accurately models:

1. **Motor drive gear** with configurable teeth count
2. **Two perpendicular slide arms** (X-axis and Y-axis)
3. **Each arm has 1–4 gears** connected by belts in series
4. **Belt speed propagation**: `ω[i] = ω[i-1] × (teeth[i-1] / teeth[i])`
5. **Each gear has a crank pin** converting rotation → linear oscillation: `displacement = R × cos(ω × θ + φ)`
6. **Paper table rotation** at its own gear ratio

Pen position: arm displacements combined and rotated into paper-frame coordinates.

## Key Interfaces

```typescript
interface Gear {
  teeth: number;        // Determines belt ratio with neighbors
  crankRadius: number;  // Crank pin distance (0 = no contribution)
  phase: number;        // Phase offset in radians
}

interface GearArm {
  gears: Gear[];        // Chain of belt-connected gears
}

interface MachineConfig {
  xArm: GearArm;       // Horizontal slide arm
  yArm: GearArm;       // Vertical slide arm
  driveTeeth: number;   // Motor drive gear teeth
  tableTeeth: number;   // Paper table gear teeth (0 = fixed)
  speed: number;        // Motor angular velocity per step
  lineWidth: number;    // Stroke width in px
}
```

## State Management

Reactive store (`store.ts`) uses Vue's `reactive()` and `ref()`:
- `config` — MachineConfig (reactive, watched by renderer)
- `colorState` — ColorGeneratorState (reactive)
- `rendererRef` — Renderer instance
- `motorTheta` — current motor angle (synced every frame)
- `running` — animation state
- `showMachine` — toggle machine diagram

## Tooling

| Tool | Purpose | Command |
|------|---------|---------|
| **Vite** | Dev server + build | `pnpm dev` / `pnpm build` |
| **vue-tsc** | Type checking | `pnpm typecheck` |
| **oxlint** | Linting (fast, Rust-based) | `pnpm lint` |
| Both | Combined check | `pnpm check` |

### Linting Config (oxlintrc.json)

- **Correctness** rules: error
- **Suspicious** rules: warn
- Key rules enabled: `no-unused-vars`, `no-console`, `eqeqeq`, `no-var`, `prefer-const`, `prefer-template`, `typescript/no-explicit-any`
- Disabled for canvas code: `no-magic-numbers`, `max-statements`, `max-params`, pedantic/style categories

## Theming

5 themes defined in `themes.ts`, applied via CSS custom properties on `:root`:
- **Midnight** 🌑 (default), **Obsidian** 🖤, **Snow** ☀️, **Warm** 🌅, **Ocean** 🌊

Theme tokens are mapped to Tailwind colors in `style.css` via `@theme {}`.

## Color Generation (colors.ts)

4 modes for the drawing stroke:
- **Static** — single hex color
- **Gradient** — lerp between two colors over drawing lifetime
- **Rainbow** — HSL hue cycling (speed, saturation, lightness configurable)
- **Palette** — cycle through 7 curated palettes (Neon, Pastel, Fire, Ocean, Forest, Sunset, Mono)

## Development Workflow

```bash
pnpm dev          # Start dev server
pnpm check        # Lint + typecheck (run before committing)
pnpm build        # Production build
pnpm preview      # Preview production build
```

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new preset "Nautilus"
fix: correct belt ratio calculation for 3+ gear chains
refactor: extract canvas drawing helpers from MachineView
style: update slider thumb hover effect
docs: update agents.md with new component
chore: bump dependencies
```
