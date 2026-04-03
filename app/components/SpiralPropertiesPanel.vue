<script setup lang="ts">
/**
 * SpiralPropertiesPanel — shows property curve editors for the active path's spiral.
 *
 * Two modes (managed locally, no layout change):
 *   - Collapsed: all 5 compact read-only thumbnails shown. Click one to expand it.
 *   - Expanded: that single curve editor fills the same space at full size,
 *     with tab buttons to switch between curves. Click "back" to return.
 */
import type { PropCurve } from "~/utils/spiral";

const { path: activePath, pushUndo } = useBezierStore();

// Which curve key is expanded (null = all collapsed/compact)
type CurveKey = "radius" | "elliptic" | "orientation" | "frequency";
const expandedKey = ref<CurveKey | null>(null);

const CURVE_KEYS: CurveKey[] = ["radius", "frequency", "elliptic", "orientation"];

function curveFor(key: CurveKey): PropCurve | undefined {
  return activePath.value?.spiral[key];
}

function toggleSpiral() {
  if (!activePath.value) return;
  pushUndo();
  activePath.value.spiral.enabled = !activePath.value.spiral.enabled;
}

function expand(key: CurveKey) {
  expandedKey.value = key;
}

function collapse() {
  expandedKey.value = null;
}

// Escape to collapse
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && expandedKey.value !== null) {
    collapse();
    e.stopPropagation();
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div v-if="activePath" class="flex flex-col gap-0.5">

    <!-- ═══════════════════════════════════════════════════════════════════
         COLLAPSED — all 5 compact read-only thumbnails
         ═══════════════════════════════════════════════════════════════ -->
    <template v-if="expandedKey === null">
      <!-- Header -->
      <div class="flex items-center gap-2 px-1 py-0.5">
        <button
          class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-colors"
          :class="activePath.spiral.enabled ? 'text-accent' : 'text-muted'"
          @click.stop="toggleSpiral"
        >
          <i :class="activePath.spiral.enabled ? 'i-mdi-eye-outline' : 'i-mdi-eye-off-outline'" class="text-sm" />
          Spiral
        </button>
        <span class="text-[9px] text-muted">click a curve to edit</span>
      </div>

      <!-- Compact thumbnails — click any to expand it -->
      <div
        class="flex flex-wrap gap-1 transition-opacity duration-200"
        :class="activePath.spiral.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'"
      >
        <div
          v-for="key in CURVE_KEYS"
          :key="key"
          class="min-w-[min(200px,100%)] max-w-[min(560px,100%)] flex-1 cursor-pointer hover:ring-1 hover:ring-accent/40 rounded-lg transition-all"
          @click="expand(key)"
        >
          <PropertyCurveEditor :curve="activePath.spiral[key]" :height="56" :expanded="false" />
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════
         EXPANDED — single curve editor fills the space
         ═══════════════════════════════════════════════════════════════ -->
    <template v-else>
      <!-- Top bar: back + curve tabs -->
      <div class="flex items-center gap-1 px-1 py-0.5">
        <!-- Back button -->
        <button
          class="flex items-center justify-center w-6 h-6 rounded-md hover:bg-elevated/60 transition-colors cursor-pointer shrink-0"
          title="Back (Esc)"
          @click="collapse"
        >
          <i class="i-mdi-arrow-left text-base text-secondary hover:text-primary" />
        </button>

        <!-- Curve tabs -->
        <div class="flex items-center gap-0.5">
          <button
            v-for="key in CURVE_KEYS"
            :key="key"
            class="curve-tab"
            :class="{ 'curve-tab-active': expandedKey === key }"
            :style="expandedKey === key ? { color: curveFor(key)?.color, borderColor: curveFor(key)?.color + '60' } : {}"
            @click="expandedKey = key"
          >
            {{ curveFor(key)?.label }}
          </button>
        </div>

        <span class="ml-auto text-[9px] text-muted">
          click to add · dbl-click to remove · click curve for presets
        </span>
      </div>

      <!-- The single expanded editor -->
      <div
        class="transition-opacity duration-200"
        :class="activePath.spiral.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'"
      >
        <PropertyCurveEditor
          :key="expandedKey"
          :curve="activePath.spiral[expandedKey]"
          :expanded="true"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.curve-tab {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  color: rgb(var(--text-muted));
  border: 1px solid transparent;
  white-space: nowrap;
}
.curve-tab:hover {
  color: rgb(var(--text-primary));
  background: rgba(var(--bg-elevated) / 0.4);
}
.curve-tab-active {
  background: rgba(var(--bg-elevated) / 0.7);
  border-color: rgba(var(--border) / 0.6);
}
</style>
