<script setup lang="ts">
/**
 * Bezier Path Editor — main page.
 * Layout: two dockable panels (toolbar + properties) around a canvas.
 * When two panels share the same edge they sit side-by-side, each shrink-wrapped.
 */
import type { DockPosition } from "~/composables/useBezierStore";

const { toolbarDock, propsDock } = useBezierStore();

// Group panels by edge
const edgePanels = computed(() => {
  const map: Record<DockPosition, string[]> = { top: [], right: [], bottom: [], left: [] };
  map[toolbarDock.value].push("toolbar");
  map[propsDock.value].push("props");
  return map;
});

const hasTop = computed(() => edgePanels.value.top.length > 0);
const hasBottom = computed(() => edgePanels.value.bottom.length > 0);
const hasLeft = computed(() => edgePanels.value.left.length > 0);
const hasRight = computed(() => edgePanels.value.right.length > 0);

function borderClasses(pos: DockPosition) {
  switch (pos) {
    case "top": return "border-b border-border/40";
    case "bottom": return "border-t border-border/40";
    case "left": return "border-r border-border/40";
    case "right": return "border-l border-border/40";
  }
}

function isVertical(pos: DockPosition) {
  return pos === "left" || pos === "right";
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- ── Top edge ──────────────────────────────────────────── -->
    <div
      v-if="hasTop"
      class="shrink-0 flex items-start gap-2 bg-surface/50 backdrop-blur p-1.5"
      :class="borderClasses('top')"
    >
      <!-- Toolbar on top -->
      <div v-if="toolbarDock === 'top'" class="flex items-start gap-1 shrink-0">
        <DockHandle :position="toolbarDock" @update:position="toolbarDock = $event" />
        <BezierToolbar />
      </div>
      <!-- Props on top -->
      <div v-if="propsDock === 'top'" class="flex items-start gap-1 flex-1 min-w-0">
        <DockHandle :position="propsDock" @update:position="propsDock = $event" />
        <div class="flex-1 min-w-0">
          <SpiralPropertiesPanel />
        </div>
      </div>
    </div>

    <!-- ── Middle row: left? + canvas + right? ───────────────── -->
    <div class="flex-1 min-h-0 flex flex-row">
      <!-- Left edge -->
      <div
        v-if="hasLeft"
        class="shrink-0 flex flex-col gap-2 bg-surface/50 backdrop-blur p-1.5 overflow-y-auto"
        :class="borderClasses('left')"
      >
        <div v-if="toolbarDock === 'left'" class="flex items-start gap-1">
          <DockHandle :position="toolbarDock" @update:position="toolbarDock = $event" />
          <BezierToolbar />
        </div>
        <div v-if="propsDock === 'left'" class="flex items-start gap-1 w-[1200px]">
          <DockHandle :position="propsDock" @update:position="propsDock = $event" />
          <div class="min-w-0">
            <SpiralPropertiesPanel />
          </div>
        </div>
      </div>

      <!-- Canvas -->
      <div class="flex-1 min-h-0 min-w-0 relative p-1.5">
        <div class="relative w-full h-full rounded-2xl overflow-hidden bg-canvas shadow-[inset_0_2px_20px_var(--color-shadow)] transition-colors duration-400">
          <BezierCanvas />
        </div>
      </div>

      <!-- Right edge -->
      <div
        v-if="hasRight"
        class="shrink-0 flex flex-col gap-2 bg-surface/50 backdrop-blur p-1.5 overflow-y-auto"
        :class="borderClasses('right')"
      >
        <div v-if="toolbarDock === 'right'" class="flex items-start gap-1">
          <DockHandle :position="toolbarDock" @update:position="toolbarDock = $event" />
          <BezierToolbar />
        </div>
        <div v-if="propsDock === 'right'" class="flex items-start gap-1 w-[1200px]">
          <DockHandle :position="propsDock" @update:position="propsDock = $event" />
          <div class="min-w-0">
            <SpiralPropertiesPanel />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Bottom edge ───────────────────────────────────────── -->
    <div
      v-if="hasBottom"
      class="shrink-0 flex items-start gap-2 bg-surface/50 backdrop-blur p-1.5"
      :class="borderClasses('bottom')"
    >
      <!-- Toolbar on bottom -->
      <div v-if="toolbarDock === 'bottom'" class="flex items-start gap-1 shrink-0">
        <DockHandle :position="toolbarDock" @update:position="toolbarDock = $event" />
        <BezierToolbar />
      </div>
      <!-- Props on bottom -->
      <div v-if="propsDock === 'bottom'" class="flex items-start gap-1 flex-1 min-w-0">
        <DockHandle :position="propsDock" @update:position="propsDock = $event" />
        <div class="flex-1 min-w-0">
          <SpiralPropertiesPanel />
        </div>
      </div>
    </div>
  </div>
</template>
