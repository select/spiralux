# AGENTS.md — Spiralux

## Screenshots

Screenshots are located at `~/Pictures/Screenshots/`

## Overview

Spiralux is a browser-based bezier path editor with spiral pattern generation.
Draw bezier paths on a canvas, then generate spirals along those paths with
property curves controlling radius, frequency, speed, elliptic ratio, and orientation.

**Stack:** Nuxt 4.4.2, Vue 3, TypeScript, UnoCSS, Tailwind CSS v4, Vite

## Architecture

```
app/
├── pages/
│   └── index.vue                # Main editor layout (canvas + dockable panels)
├── components/
│   ├── BezierCanvas.vue         # Main SVG/Canvas — bezier path drawing + spiral rendering
│   ├── BezierToolbar.vue        # Tool palette (pen, select, pan, zoom, spiral toggle, etc.)
│   ├── DockHandle.vue           # Draggable dock position switcher (top/bottom/left/right)
│   ├── SpiralPropertiesPanel.vue# Spiral property curves panel (compact thumbnails + expanded editor)
│   ├── PropertyCurveEditor.vue  # Bezier curve editor for spiral properties (nodes, handles, presets)
│   ├── SliderField.vue          # Reusable range slider component
│   ├── ThemeSwitcher.vue        # UI theme picker (CSS custom properties)
│   └── TargetCard.vue           # Reference image card
├── composables/
│   └── useBezierStore.ts        # Reactive store — paths, nodes, spiral config, undo/redo, import/export
├── utils/
│   ├── spiral.ts                # Spiral generation: arc-length sampling, curvature compensation, property curves
│   ├── engine.ts                # Mechanical simulation (gear chains, belt ratios — legacy)
│   ├── themes.ts                # UI theme definitions + CSS variable injection
│   ├── experiments.ts           # Experiment tracking utilities
│   └── targets.ts               # Target image references
├── assets/
│   └── icons/                   # Custom SVG icons for UnoCSS (node-sharp, node-smooth, node-symmetric, node-auto)
└── app.vue                      # Root layout

scripts/
├── params.ts                    # Machine config for headless experiments
├── render.ts                    # Headless SVG renderer
├── experiment.ts                # Experiment runner
└── targets.ts                   # Target definitions

uno.config.ts                    # UnoCSS config with custom icon collection (app/)
```

## Key Concepts

### Bezier Paths
- Multiple paths, one active for editing
- Each path has nodes with handleIn/handleOut control points
- Paths stored in localStorage via `useBezierStore`

### Spiral Generation (`spiral.ts`)
- **Arc-length parameterization**: Two-pass sampling ensures property curves evaluate at physically uniform positions along the backbone path
- **Curvature compensation**: Adjusts angular rate by backbone curvature to keep coil spacing uniform on curved paths
- **Property curves**: 5 bezier-based curves control spiral properties over the path length:
  - `radius` — coil size
  - `frequency` — coil density
  - `speed` — drawing speed
  - `elliptic` — ellipse ratio (1 = circle)
  - `orientation` — ellipse rotation angle

### Property Curve Editor
- **Compact mode**: Small read-only thumbnails, click to expand
- **Expanded mode**: Full editor with node manipulation, handle dragging, snap guides
- **Node tools**: Sharp (zero handles), Smooth (align tangent), Symmetric (mirror handles)
- **Presets**: Inline scrollable strip of easing curves (linear, ease, material, etc.)
- **Snapping**: Y-snap to other nodes, X-snap to center (0.5), handle snap at 0°

### Dockable Panels
- Toolbar and properties panel can be docked to any edge (top/bottom/left/right)
- Defaults: toolbar → bottom, props → top
- Canvas auto-resizes via ResizeObserver when panels change

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Nuxt dev server (usually port 3000 or 3002) |
| `pnpm build` | Production build |
| `pnpm check` | Lint (oxlint) + typecheck (vue-tsc) |
| `pnpm render` | Headless SVG render from `scripts/params.ts` |
| `pnpm render:open` | Render + open SVG |

## Dev Notes

- `vue-tsc` may show a non-blocking warning about `vue-router/volar/sfc-route-blocks` — not a real error
- Custom icons use hardcoded colors (`#ec4899` pink, `#e4e4e7` light gray) so UnoCSS renders them as `background-image` (colored) not `mask` (monochrome)
- MDI icons available via UnoCSS (`@iconify-json/mdi`), use as `i-mdi-icon-name`

## Commits

Short descriptive messages. Group related changes into single commits.
