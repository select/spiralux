<script setup lang="ts">
/**
 * DockHandle — small drag grip that snaps a panel to viewport edges.
 * Click cycles T→R→B→L, or drag and release to snap to nearest edge.
 */
import type { DockPosition } from "~/composables/useBezierStore";

const props = defineProps<{
  position: DockPosition;
}>();

const emit = defineEmits<{
  (e: "update:position", pos: DockPosition): void;
}>();

const CYCLE: DockPosition[] = ["top", "right", "bottom", "left"];

let dragging = false;
let didDrag = false;

function onClick() {
  if (didDrag) return;
  const idx = CYCLE.indexOf(props.position);
  emit("update:position", CYCLE[(idx + 1) % CYCLE.length]!);
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  dragging = true;
  didDrag = false;

  const onMove = (e: MouseEvent) => {
    didDrag = true;
  };

  const onUp = (e: MouseEvent) => {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);

    if (!didDrag) return;

    // Snap to nearest edge based on mouse position
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = e.clientX;
    const y = e.clientY;

    const distTop = y;
    const distBottom = vh - y;
    const distLeft = x;
    const distRight = vw - x;

    const min = Math.min(distTop, distBottom, distLeft, distRight);
    let pos: DockPosition = "top";
    if (min === distRight) pos = "right";
    else if (min === distBottom) pos = "bottom";
    else if (min === distLeft) pos = "left";

    emit("update:position", pos);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

const iconMap: Record<DockPosition, string> = {
  top: "i-mdi-dock-top",
  right: "i-mdi-dock-right",
  bottom: "i-mdi-dock-bottom",
  left: "i-mdi-dock-left",
};
</script>

<template>
  <button
    class="dock-handle"
    :title="`Dock: ${position} — click to cycle, drag to snap`"
    @mousedown="onMouseDown"
    @click="onClick"
  >
    <i :class="iconMap[position]" class="text-xs" />
  </button>
</template>

<style scoped>
.dock-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: grab;
  color: rgba(var(--text-muted));
  transition: all 0.15s;
  opacity: 0.5;
}
.dock-handle:hover {
  opacity: 1;
  background: rgba(var(--bg-elevated) / 0.6);
  color: rgb(var(--text-primary));
}
.dock-handle:active {
  cursor: grabbing;
}
</style>
