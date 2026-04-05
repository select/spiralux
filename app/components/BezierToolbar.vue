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
  renamePath,
  togglePathVisible,
  movePathOrder,
  showSpines,
  spiralBlendMode,
  BLEND_MODES,
  downloadProject,
  uploadProject,
  CANVAS_TEMPLATES,
  templateId,
  templateVisible,
} = useBezierStore();

// Theme
const { THEMES, applyTheme, getCurrentTheme } = await import('~/utils/themes');
const currentThemeId = ref(getCurrentTheme().id);
function switchTheme(id: string) {
  const theme = THEMES.find((t: any) => t.id === id);
  if (!theme) return;
  applyTheme(theme);
  currentThemeId.value = id;
}

const showNav = ref(false);
const route = useRoute();
function navigate(path: string) {
  showNav.value = false;
  navigateTo(path);
}

const selCount = computed(() => selectedIds.size);
const isVertical = computed(() => toolbarDock.value === "left" || toolbarDock.value === "right");

// Inline rename
const editingIdx = ref<number | null>(null);
const editName = ref("");
function startRename(i: number) {
  editingIdx.value = i;
  editName.value = paths[i]?.name ?? "";
  nextTick(() => {
    const el = document.querySelector(".rename-input") as HTMLInputElement;
    el?.focus();
    el?.select();
  });
}
function commitRename() {
  if (editingIdx.value !== null && editName.value.trim()) {
    renamePath(editingIdx.value, editName.value.trim());
  }
  editingIdx.value = null;
}

// Drag reorder
const dragIdx = ref<number | null>(null);
const dropIdx = ref<number | null>(null);
function onDragStart(i: number, e: DragEvent) {
  dragIdx.value = i;
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("text/plain", String(i));
}
function onDragOver(i: number, e: DragEvent) {
  e.preventDefault();
  dropIdx.value = i;
}
function onDrop(i: number) {
  if (dragIdx.value !== null && dragIdx.value !== i) {
    movePathOrder(dragIdx.value, i);
  }
  dragIdx.value = null;
  dropIdx.value = null;
}
function onDragEnd() {
  dragIdx.value = null;
  dropIdx.value = null;
}
</script>

<template>
  <div class="inline-flex gap-1.5 items-start" :class="[isVertical ? 'flex-col' : 'flex-row flex-wrap', toolbarDock === 'top' && 'dock-top']">

    <!-- ── Row 0: Path list / switcher ──────────────────────────── -->
    <div class="toolbar-row gap-1">

      <!-- Nav menu -->
      <div class="relative">
        <button class="tb" data-tip="Menu" @click="showNav = !showNav">
          <i class="i-mdi-menu text-lg" />
        </button>
        <Transition name="menu">
          <div
            v-if="showNav"
            class="absolute left-0 z-50 min-w-36 bg-surface border border-border/60 rounded-lg shadow-lg overflow-hidden"
            :class="toolbarDock === 'top' ? 'top-full mt-1' : 'bottom-full mb-1'"
          >
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-elevated/60 transition-colors cursor-pointer"
              :class="route.path === '/' ? 'text-accent font-semibold' : 'text-primary'"
              @click="navigate('/')"
            >
              <i class="i-mdi-vector-bezier" /> Editor
            </button>
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-elevated/60 transition-colors cursor-pointer"
              :class="route.path === '/evolve' ? 'text-accent font-semibold' : 'text-primary'"
              @click="navigate('/evolve')"
            >
              <i class="i-mdi-dna" /> Genetic Evolution
            </button>
          </div>
        </Transition>
        <div v-if="showNav" class="fixed inset-0 z-40" @click="showNav = false" />
      </div>

      <div class="divider" />

      <span class="toolbar-label">Lines</span>

      <div
        v-for="(p, i) in paths"
        :key="p.id"
        class="path-tab group"
        :class="[
          i === activePathIndex ? 'path-tab-active' : '',
          !p.visible ? 'opacity-40' : '',
          dropIdx === i && dragIdx !== i ? 'ring-1 ring-primary' : '',
        ]"
        draggable="true"
        @click="setActivePath(i)"
        @dblclick.stop="startRename(i)"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <span
          class="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
          :style="{ background: p.color }"
        />
        <template v-if="editingIdx === i">
          <input
            class="rename-input w-16 h-4 text-[11px] bg-elevated border border-primary/60 rounded px-1 text-primary"
            v-model="editName"
            @keydown.enter="commitRename"
            @keydown.escape="editingIdx = null"
            @blur="commitRename"
            @click.stop
          />
        </template>
        <template v-else>
          <span class="text-[11px] font-medium truncate max-w-20">{{ p.name }}</span>
        </template>
        <span class="text-[9px] text-muted tabular-nums">{{ p.nodes.length }}</span>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 p-0"
          :data-tip="p.visible ? 'Hide' : 'Show'"
          @click.stop="togglePathVisible(i)"
        >
          <i :class="p.visible ? 'i-mdi-eye' : 'i-mdi-eye-off'" class="text-sm" />
        </button>
      </div>

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

      <div class="divider" />

      <button class="tb" data-tip="Save project" @click="downloadProject">
        <i class="i-mdi-content-save text-lg" />
      </button>
      <button class="tb" data-tip="Load project" @click="uploadProject">
        <i class="i-mdi-folder-open text-lg" />
      </button>

      <div class="divider" />

      <select
        class="h-7 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary cursor-pointer"
        :value="currentThemeId"
        @change="(e: Event) => switchTheme((e.target as HTMLSelectElement).value)"
      >
        <option v-for="t in THEMES" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>

      <div class="divider" />

      <!-- Template overlay -->
      <span class="toolbar-label">Tmpl</span>
      <select
        class="h-7 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary cursor-pointer"
        :value="templateId ?? ''"
        @change="(e: Event) => { const v = (e.target as HTMLSelectElement).value; templateId = v || null; }"
      >
        <option value="">— none —</option>
        <option v-for="t in CANVAS_TEMPLATES" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <button
        class="tb"
        :class="{ 'opacity-30': !templateId, 'tb-active': templateId && templateVisible }"
        :data-tip="templateVisible ? 'Hide template' : 'Show template'"
        :disabled="!templateId"
        @click="templateVisible = !templateVisible"
      >
        <i :class="templateVisible ? 'i-mdi-layers' : 'i-mdi-layers-off'" class="text-lg" />
      </button>

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
/* Default: tooltip above */
.tb::after {
  bottom: calc(100% + 6px);
}
/* When toolbar is docked top: tooltip below */
.dock-top .tb::after {
  bottom: auto;
  top: calc(100% + 6px);
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

.menu-enter-active, .menu-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}
.menu-enter-from, .menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
