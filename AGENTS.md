# AGENTS.md — Spiralux

## Screenshots

Screenshots are located at `~/Pictures/Screenshots/`

Browser-based spiral art generator + headless SVG renderer for iterative pattern matching.

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
└── render.ts                # Headless SVG renderer (reads params.ts → output/exp-NNNN.svg + experiments.csv)

docs/
└── simulation-loop.md       # Guide: iterative pattern matching workflow

output/                      # gitignored
├── experiments.csv          # Log of ALL experiments with full parameters
├── exp-0001.svg/.png        # Numbered experiment archive (never overwritten)
├── exp-0002.svg/.png        # ...
└── experiment.svg/.png      # Latest render (always overwritten)
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

## Experiment Loop (autoresearch style)

Renders take ~150ms. Experiments are nearly free. **Stop thinking, start rendering.**

### Setup (once per session)

1. Read `output/experiments.csv` — know what's been tried
2. Look at PNGs of the best experiments so far + the target image
3. Identify what to try next

### The Loop (run forever until interrupted)

```
LOOP FOREVER:
  1. Edit scripts/params.ts — ONE change per experiment
  2. pnpm render -- --notes "short description of what changed"
  3. Look at the output PNG — compare to target
  4. If closer to target → KEEP (git commit)
     If same or worse  → DISCARD (git checkout scripts/params.ts)
  5. Go to 1. Do NOT pause to ask the human.
```

### Rules

- **Never stop to ask** "should I continue?" — the human may be away. Run until interrupted.
- **Never over-analyze** — if unsure whether a change will help, just render it and look. The experiment is free.
- **One change at a time** — so you know what helped or hurt.
- **Use low steps first** (5k–10k) for fast shape iteration, increase to 80k only for final density tuning.
- **Always add `--notes`** — your future self needs to know what each experiment tried.
- **Crashes**: if `pnpm render` fails, fix the obvious bug and re-run. Don't spiral.
- **If stuck**: re-read the target image, try something radically different, combine near-misses.

### What to tune (in rough priority order)

1. **Gear teeth** → controls lobe count and shape (the most important knob)
2. **crankRadius** → controls amplitude / lobe size
3. **Number of gears per arm** → adds harmonics for complex shapes
4. **tableTeeth** → controls fill density (0 = off for raw shape iteration)
5. **phase** → rotates/orients the pattern
6. **passes / colors** → save for last, after single-pass shape is right
7. **steps** → more = denser lines (keep low during iteration)

Full guide: **[docs/simulation-loop.md](docs/simulation-loop.md)**

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
