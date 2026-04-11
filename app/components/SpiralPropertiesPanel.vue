<script setup lang="ts">
/**
 * SpiralPropertiesPanel — shows property curve editors + deformation editor.
 *
 * Two modes:
 *   - Collapsed: all compact thumbnails shown in a row. Click any to expand.
 *   - Expanded: that single editor fills the full space, with tabs to switch
 *     between all curves and the deformation panel. Back / Esc to collapse.
 */
import type { PropCurve } from "~/utils/spiral";

const { path: activePath, pushUndo } = useBezierStore();

type CurveKey = "radius" | "frequency";
type ExpandedKey = CurveKey | "deformation";

// null = all compact thumbnails; a key = that editor is fullscreen
const expandedKey = ref<ExpandedKey | null>(null);

const CURVE_KEYS: CurveKey[] = ["radius", "frequency"];

function curveFor(key: CurveKey): PropCurve | undefined {
  return activePath.value?.spiral[key];
}

function toggleSpiral() {
  if (!activePath.value) return;
  pushUndo();
  activePath.value.spiral.enabled = !activePath.value.spiral.enabled;
}

function expand(key: ExpandedKey) {
  expandedKey.value = key;
}

function collapse() {
  expandedKey.value = null;
}

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
         COLLAPSED — compact row of thumbnails
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
        <label class="flex items-center gap-1 text-[10px] text-muted">
          <span>lw</span>
          <input
            type="number"
            min="0.01"
            max="10"
            step="0.05"
            class="w-14 h-5 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary text-right appearance-none"
            :value="activePath.spiral.lineWidth"
            @change="(e) => { pushUndo(); activePath!.spiral.lineWidth = Math.max(0.01, parseFloat((e.target as HTMLInputElement).value) || 0.3); }"
          />
          <span>mm</span>
        </label>
        <label class="flex items-center gap-1 text-[10px] text-muted">
          <span>∡</span>
          <input
            type="number"
            min="-360"
            max="360"
            step="1"
            class="w-12 h-5 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary text-right appearance-none"
            :value="activePath.spiral.rotation"
            @change="(e) => { pushUndo(); activePath!.spiral.rotation = parseFloat((e.target as HTMLInputElement).value) || 0; }"
          />
          <span>°</span>
        </label>
        <label class="flex items-center gap-1 text-[10px] text-muted">
          <span>✕</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.05"
            class="w-12 h-5 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary text-right appearance-none"
            :value="activePath.spiral.scale"
            @change="(e) => { pushUndo(); activePath!.spiral.scale = Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 1); }"
          />
        </label>
        <span class="text-[9px] text-muted">click a panel to edit</span>
      </div>

      <!-- Compact thumbnails row — all in one flex-wrap row -->
      <div
        class="flex flex-wrap gap-1 transition-opacity duration-200"
        
      >
        <!-- Prop curve thumbnails -->
        <div
          v-for="key in CURVE_KEYS"
          :key="key"
          class="min-w-20 flex-1 cursor-pointer hover:ring-1 hover:ring-accent/40 rounded-lg transition-all"
          @click="expand(key)"
        >
          <PropertyCurveEditor :curve="activePath.spiral[key]" :height="56" :expanded="false" />
        </div>

        <!-- Deformation thumbnail -->
        <div
          class="min-w-20 flex-1 cursor-pointer hover:ring-1 hover:ring-[#a855f7]/40 rounded-lg transition-all"
          @click="expand('deformation')"
        >
          <DeformationPanel :expanded="false" />
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════
         EXPANDED — single editor fills the space, tabs to switch
         ═══════════════════════════════════════════════════════════════ -->
    <template v-else>
      <!-- Top bar: back + all tabs -->
      <div class="flex items-center gap-1 px-1 py-0.5 flex-wrap">
        <button
          class="flex items-center justify-center w-6 h-6 rounded-md hover:bg-elevated/60 transition-colors cursor-pointer shrink-0"
          title="Back (Esc)"
          @click="collapse"
        >
          <i class="i-mdi-arrow-left text-base text-secondary hover:text-primary" />
        </button>

        <div class="flex items-center gap-0.5 flex-wrap">
          <!-- Curve tabs -->
          <button
            v-for="key in CURVE_KEYS"
            :key="key"
            class="curve-tab"
            :class="{ 'curve-tab-active': expandedKey === key }"
            :style="expandedKey === key ? { color: curveFor(key)?.color, borderColor: (curveFor(key)?.color ?? '') + '60' } : {}"
            @click="expandedKey = key"
          >
            {{ curveFor(key)?.label }}
          </button>

          <!-- Deform tab -->
          <button
            class="curve-tab"
            :class="{ 'curve-tab-active': expandedKey === 'deformation' }"
            :style="expandedKey === 'deformation' ? { color: '#a855f7', borderColor: '#a855f760' } : {}"
            @click="expandedKey = 'deformation'"
          >
            Deform
          </button>
        </div>

        <span class="ml-auto text-[9px] text-muted hidden sm:block">
          <template v-if="expandedKey !== 'deformation'">
            click to add · dbl-click to remove · click curve for presets
          </template>
          <template v-else>
            click to add point · dbl-click to remove · drag nodes to deform
          </template>
        </span>

        <!-- Eye toggle + line width always visible in expanded mode -->
        <button
          class="ml-auto sm:ml-0 flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer shrink-0"
          :class="activePath.spiral.enabled ? 'text-accent hover:text-accent/70' : 'text-muted hover:text-primary'"
          :title="activePath.spiral.enabled ? 'Hide spiral' : 'Show spiral'"
          @click.stop="toggleSpiral"
        >
          <i :class="activePath.spiral.enabled ? 'i-mdi-eye-outline' : 'i-mdi-eye-off-outline'" class="text-base" />
        </button>
        <label class="flex items-center gap-1 text-[10px] text-muted shrink-0 cursor-pointer">
          <span>lw</span>
          <input
            type="number"
            min="0.01"
            max="10"
            step="0.05"
            class="w-14 h-5 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary text-right appearance-none"
            :value="activePath.spiral.lineWidth"
            @change="(e) => { pushUndo(); activePath!.spiral.lineWidth = Math.max(0.01, parseFloat((e.target as HTMLInputElement).value) || 0.3); }"
          />
          <span>mm</span>
        </label>
        <label class="flex items-center gap-1 text-[10px] text-muted shrink-0 cursor-pointer">
          <span>∡</span>
          <input
            type="number"
            min="-360"
            max="360"
            step="1"
            class="w-12 h-5 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary text-right appearance-none"
            :value="activePath.spiral.rotation"
            @change="(e) => { pushUndo(); activePath!.spiral.rotation = parseFloat((e.target as HTMLInputElement).value) || 0; }"
          />
          <span>°</span>
        </label>
        <label class="flex items-center gap-1 text-[10px] text-muted shrink-0 cursor-pointer">
          <span>✕</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.05"
            class="w-12 h-5 text-[10px] bg-elevated/50 border border-border/40 rounded px-1 text-primary text-right appearance-none"
            :value="activePath.spiral.scale"
            @change="(e) => { pushUndo(); activePath!.spiral.scale = Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 1); }"
          />
        </label>
      </div>

      <!-- Editor body -->
      <div
        class="transition-opacity duration-200"
        
      >
        <!-- Prop curve editor -->
        <template v-if="expandedKey !== 'deformation'">
          <PropertyCurveEditor
            :key="expandedKey"
            :curve="activePath.spiral[expandedKey]"
            :expanded="true"
          />
        </template>

        <!-- Deformation editor -->
        <template v-else>
          <DeformationPanel :expanded="true" />
        </template>
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
