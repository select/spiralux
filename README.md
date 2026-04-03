# Spiralux

A browser-based bezier path editor with spiral pattern generation. Draw bezier curves on a canvas, then generate intricate spiral patterns along those paths with fine-grained control over radius, frequency, speed, elliptic ratio, and orientation.

![Nuxt](https://img.shields.io/badge/Nuxt-4.4-00DC82?logo=nuxt.js&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)

## Features

- **Bezier Path Editor** — Draw and manipulate multi-node bezier paths with intuitive handle controls
- **Spiral Generation** — Generate spirals along bezier paths with arc-length parameterization and curvature compensation
- **Property Curves** — 5 independent bezier curves control how spiral properties vary along the path:
  - Radius, Frequency, Speed, Elliptic ratio, Orientation
- **Curve Editor** — Compact thumbnail view with click-to-expand full editor, node tools (sharp/smooth/symmetric), and easing presets
- **Dockable Panels** — Toolbar and properties panel dock to any edge
- **Themes** — Multiple UI themes via CSS custom properties
- **Persistent State** — All paths and settings saved to localStorage
- **Undo/Redo** — Full history for path and curve editing

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Production build
pnpm build
```

## Usage

1. **Draw a path** — Select the pen tool and click on the canvas to place bezier nodes
2. **Edit nodes** — Drag nodes and handles to shape your path
3. **Enable spiral** — Toggle spiral generation in the toolbar
4. **Tune properties** — Click any property curve thumbnail to expand the full editor
5. **Shape curves** — Add/remove nodes, drag handles, apply easing presets
6. **Export** — Use the toolbar export options

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `H` | Toggle spiral spine visibility |
| `Delete` / `Backspace` | Delete selected node |
| `Arrow keys` | Nudge selected node (Shift = 10px) |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all nodes |
| `Escape` | Deselect / close expanded curve editor |

### Curve Editor

- **Compact view**: Read-only thumbnails showing curve shape
- **Expanded view**: Click a thumbnail to open the full editor
- **Add node**: Click on the curve
- **Remove node**: Double-click a node
- **Apply preset**: Click a curve segment to show easing presets
- **Handle snap**: Handles snap to 0° (horizontal)
- **Shift+drag**: Move handle independently (break symmetry)

## Tech Stack

- [Nuxt 4](https://nuxt.com/) — Vue 3 meta-framework
- [UnoCSS](https://unocss.dev/) — Atomic CSS with custom icon collection
- [Tailwind CSS v4](https://tailwindcss.com/) — Utility styles
- [VueUse](https://vueuse.org/) — Composable utilities
- [MDI Icons](https://pictogrammers.com/library/mdi/) — Material Design Icons via `@iconify-json/mdi`

## License

ISC
