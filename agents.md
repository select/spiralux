# agents.md — Cycloid Drawing Machine Simulator

Browser-based simulator of the Nolan Gandy Cycloid Drawing Machine + headless SVG renderer for iterative pattern matching.

**Stack:** Vue 3, TypeScript, Tailwind CSS v4, Vite

## Architecture

```
src/
├── engine.ts                # Mechanical simulation (gear chains, belt ratios, pen position)
├── renderer.ts              # Canvas drawing loop + drawPreview() for live mode
├── store.ts                 # Reactive state (config, colorState, liveMode, etc.)
├── colors.ts                # 4 color modes: static, gradient, rainbow, palette
├── themes.ts                # 5 UI themes via CSS custom properties
├── presets.ts               # 10 curated gear configurations
├── App.vue                  # Root layout + keyboard shortcut handler
├── main.ts                  # Entry point
└── components/
    ├── CanvasView.vue       # Drawing canvas + floating overlay controls + live mode
    ├── MachineGearPanel.vue # Machine diagram + gear controls side-by-side
    ├── MachineView.vue      # Animated top-down gear train canvas
    ├── CompactGearSlider.vue# Single-line T/R/φ slider
    ├── Sidebar.vue          # Presets, machine panel, globals, color generator
    ├── GlobalControls.vue   # Drive teeth, table teeth, speed, line width
    ├── ColorGenerator.vue   # Color mode + palette selector
    ├── PresetSelector.vue   # 10-preset icon grid
    ├── ThemeSwitcher.vue    # 5-theme pill switcher
    ├── SliderField.vue      # Reusable v-model range slider
    └── HelpModal.vue        # Keyboard shortcut reference

scripts/
├── params.ts                # ← EDIT THIS — machine config for headless experiments
└── render.ts                # Headless SVG renderer (reads params.ts → output/experiment.svg)

docs/
└── simulation-loop.md       # Guide: iterative pattern matching workflow
```

## Mechanical Model

Two perpendicular slide arms (X/Y), each with 1–4 belt-connected gears. Each gear has teeth (speed ratio), crank radius (amplitude), and phase. Paper table optionally rotates. See `engine.ts`.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Vite dev server |
| `pnpm render` | Headless SVG render from `scripts/params.ts` |
| `pnpm render:open` | Render + open SVG |
| `pnpm check` | Lint (oxlint) + typecheck (vue-tsc) |
| `pnpm build` | Production build |

## Keyboard Shortcuts (browser)

`Space` play/pause · `R` reset · `C` clear · `L` live mode · `M` machine · `E` export · `H` help

## Iterative Pattern Matching

To replicate a target image, use the headless renderer loop:

1. Edit `scripts/params.ts` (gear config, passes, steps)
2. Run `pnpm render`
3. Compare `output/experiment.svg` to target
4. Tweak, repeat

Full guide: **[docs/simulation-loop.md](docs/simulation-loop.md)**

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
