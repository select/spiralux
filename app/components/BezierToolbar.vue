<script setup lang="ts">
/**
 * BezierToolbar — floating toolbar with Material Design icon buttons.
 * Supports multiple paths with add/remove/switch.
 */
const {
  paths,
  path: activePath,
  activePathIndex,
  hasSelection,
  selectedIds,
  selectAll,
  deselectAll,
  removeSelected,
  toggleClosed,
  reversePath,
  undo,
  redo,
  canUndo,
  canRedo,
  mirrorX,
  mirrorY,
  duplicateSelected,
  alignSelectedX,
  alignSelectedY,
  distributeX,
  distributeY,
  clearPath,
  smoothSelected,
  symmetrizeHandles,
  addPath,
  removePath,
  setActivePath,
  duplicatePath,
  setPathColor,
  toolbarDock,
  showSpines,
  spiralBlendMode,
  BLEND_MODES,
} = useBezierStore();

const selCount = computed(() => selectedIds.size);
const isVertical = computed(() => toolbarDock.value === "left" || toolbarDock.value === "right");
</script>

<template>
  <div class="inline-flex gap-1.5 items-start" :class="isVertical ? 'flex-col' : 'flex-row flex-wrap'">

    <!-- ── Row 0: Path list / switcher ──────────────────────────── -->
    <div class="toolbar-row gap-1">
      <span class="toolbar-label">Lines</span>

      <button
        v-for="(p, i) in paths"
        :key="p.id"
        class="path-tab"
        :class="{ 'path-tab-active': i === activePathIndex }"
        @click="setActivePath(i)"
      >
        <span
          class="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
          :style="{ background: p.color }"
        />
        <span class="text-[11px] font-medium truncate max-w-20">{{ p.name }}</span>
        <span class="text-[9px] text-muted tabular-nums">{{ p.nodes.length }}</span>
      </button>

      <div class="divider" />

      <button class="tb" data-tip="New path" @click="addPath()">
        <i class="i-mdi-plus text-lg" />
      </button>
      <button class="tb" data-tip="Duplicate path" @click="duplicatePath(activePathIndex)">
        <i class="i-mdi-content-duplicate text-lg" />
      </button>
      <button
        class="tb tb-danger"
        :class="{ disabled: paths.length <= 1 }"
        data-tip="Delete path"
        @click="removePath(activePathIndex)"
      >
        <i class="i-mdi-close-circle-outline text-lg" />
      </button>

      <div class="divider" />

      <label class="flex items-center gap-1 cursor-pointer" data-tip="Path color">
        <input
          type="color"
          class="w-6 h-6 rounded cursor-pointer border border-border/60"
          :value="activePath?.color ?? '#6366f1'"
          @input="(e: Event) => setPathColor(activePathIndex, (e.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div v-if="!isVertical" class="self-stretch w-px bg-border/40 my-1" />

    <!-- ── Row 1: Path actions ──────────────────────────────────── -->
    <div class="toolbar-row">
      <span class="toolbar-label">Edit</span>

      <button class="tb" :class="{ disabled: !canUndo }" data-tip="Undo (Ctrl+Z)" @click="undo">
        <i class="i-mdi-undo text-lg" />
      </button>
      <button class="tb" :class="{ disabled: !canRedo }" data-tip="Redo (Ctrl+Shift+Z)" @click="redo">
        <i class="i-mdi-redo text-lg" />
      </button>

      <div class="divider" />

      <button
        class="tb"
        :class="{ 'tb-active': activePath?.closed }"
        data-tip="Toggle closed path"
        @click="toggleClosed"
      >
        <i :class="activePath?.closed ? 'i-mdi-vector-square' : 'i-mdi-vector-polyline'" class="text-lg" />
      </button>
      <button class="tb" data-tip="Reverse path direction" @click="reversePath">
        <i class="i-mdi-swap-horizontal text-lg" />
      </button>

      <div class="divider" />

      <button class="tb" data-tip="Select all (Ctrl+A)" @click="selectAll">
        <i class="i-mdi-select-all text-lg" />
      </button>
      <button class="tb" data-tip="Deselect all (Esc)" @click="deselectAll">
        <i class="i-mdi-select-off text-lg" />
      </button>

      <div class="divider" />

      <button class="tb tb-danger" data-tip="Clear all nodes" @click="clearPath">
        <i class="i-mdi-delete-sweep text-lg" />
      </button>

      <div class="divider" />

      <button class="tb" :class="{ 'tb-active': !showSpines }" data-tip="Hide/show spines (H)" @click="showSpines = !showSpines">
        <i class="i-mdi-vector-curve text-lg" />
      </button>

      <select
        class="h-7 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary cursor-pointer"
        :value="spiralBlendMode"
        @change="(e: Event) => spiralBlendMode = (e.target as HTMLSelectElement).value as any"
      >
        <option v-for="m in BLEND_MODES" :key="m" :value="m">{{ m }}</option>
      </select>

      <span class="text-[10px] text-muted tabular-nums">
        {{ activePath?.nodes.length ?? 0 }} nodes
      </span>
    </div>

    <div v-if="!isVertical" class="self-stretch w-px bg-border/40 my-1" />

    <!-- ── Row 2: Selection actions (always present, fades when empty) ── -->
    <div
      class="toolbar-row transition-opacity duration-150"
      :class="hasSelection ? 'opacity-100' : 'opacity-30 pointer-events-none'"
    >
      <span class="toolbar-label text-cyan-400">{{ selCount }} sel</span>

      <button class="tb" data-tip="Duplicate selected" @click="duplicateSelected()">
        <i class="i-mdi-content-copy text-lg" />
      </button>
      <button class="tb tb-danger" data-tip="Delete selected (Del)" @click="removeSelected">
        <i class="i-mdi-delete-outline text-lg" />
      </button>

      <div class="divider" />

      <button class="tb" data-tip="Mirror horizontally" @click="mirrorX">
        <i class="i-mdi-flip-horizontal text-lg" />
      </button>
      <button class="tb" data-tip="Mirror vertically" @click="mirrorY">
        <i class="i-mdi-flip-vertical text-lg" />
      </button>

      <div class="divider" />

      <button class="tb" data-tip="Smooth handles" @click="smoothSelected">
        <i class="i-mdi-chart-bell-curve-cumulative text-lg" />
      </button>
      <button class="tb" data-tip="Symmetrize handles" @click="symmetrizeHandles">
        <i class="i-mdi-reflect-horizontal text-lg" />
      </button>

      <div class="divider" />

      <button class="tb" :class="{ disabled: selCount < 2 }" data-tip="Align X" @click="alignSelectedX">
        <i class="i-mdi-align-horizontal-center text-lg" />
      </button>
      <button class="tb" :class="{ disabled: selCount < 2 }" data-tip="Align Y" @click="alignSelectedY">
        <i class="i-mdi-align-vertical-center text-lg" />
      </button>
      <button class="tb" :class="{ disabled: selCount < 3 }" data-tip="Distribute X" @click="distributeX">
        <i class="i-mdi-distribute-horizontal-center text-lg" />
      </button>
      <button class="tb" :class="{ disabled: selCount < 3 }" data-tip="Distribute Y" @click="distributeY">
        <i class="i-mdi-distribute-vertical-center text-lg" />
      </button>
    </div>

  </div>
</template>

<style scoped>
.toolbar-row {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  background: rgba(var(--bg-base) / 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(var(--border) / 0.6);
  border-radius: 0.75rem;
  padding: 3px 8px;
  box-shadow: 0 4px 16px rgb(var(--shadow-color));
}

.toolbar-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--text-muted));
  margin-right: 4px;
  white-space: nowrap;
}

/* ── Path tab ──────────────────────────────────── */
.path-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
  color: rgb(var(--text-secondary));
  border: 1px solid transparent;
}
.path-tab:hover {
  background: rgba(var(--bg-elevated) / 0.5);
  color: rgb(var(--text-primary));
}
.path-tab-active {
  background: rgba(var(--bg-elevated) / 0.8);
  color: rgb(var(--text-primary));
  border-color: rgba(var(--border) / 0.8);
}

/* ── Icon button ─────────────────────────────────── */
.tb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
  color: rgb(var(--text-secondary));
}
.tb:hover {
  color: rgb(var(--text-primary));
  background: rgba(var(--bg-elevated) / 0.6);
}
.tb:active {
  transform: scale(0.92);
}

.tb::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgb(var(--bg-elevated));
  color: rgb(var(--text-primary));
  border: 1px solid rgba(var(--border) / 0.6);
  box-shadow: 0 2px 8px rgb(var(--shadow-color));
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 50;
}
.tb:hover::after {
  opacity: 1;
}

.tb-active {
  color: rgb(var(--accent)) !important;
  background: rgba(var(--accent) / 0.12);
  outline: 1px solid rgba(var(--accent) / 0.25);
}

.tb-danger:hover {
  color: #f87171 !important;
}

.tb.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.divider {
  width: 1px;
  height: 18px;
  background: rgba(var(--border) / 0.6);
  margin: 0 2px;
}

.kbd {
  display: inline-block;
  border: 1px solid rgb(var(--border));
  border-radius: 3px;
  padding: 0 4px;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  color: rgb(var(--text-muted));
}
</style>
