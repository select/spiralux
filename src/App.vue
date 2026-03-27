<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import CanvasView from "./components/CanvasView.vue";
import Sidebar from "./components/Sidebar.vue";
import HelpModal from "./components/HelpModal.vue";
import GalleryView from "./components/GalleryView.vue";
import {
  rendererRef, running, resetAll, exportPNG,
  showMachine, showHelp, liveMode, activeView,
} from "./store";

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  // Gallery shortcut — works regardless of active view
  if (e.key === "g" || e.key === "G") {
    activeView.value = activeView.value === "gallery" ? "studio" : "gallery";
    return;
  }

  // Studio-only shortcuts
  if (activeView.value !== "studio") return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      rendererRef.value?.toggle();
      running.value = rendererRef.value?.isRunning() ?? false;
      break;
    case "r": case "R": resetAll(); break;
    case "c": case "C": rendererRef.value?.clear(); break;
    case "l": case "L": liveMode.value = !liveMode.value; break;
    case "m": case "M": showMachine.value = !showMachine.value; break;
    case "e": case "E": exportPNG(); break;
    case "?": case "h": case "H": showHelp.value = !showHelp.value; break;
    case "Escape": showHelp.value = false; break;
  }
}

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div class="h-full flex flex-col">

    <!-- ── Tab bar ──────────────────────────────────────────────────────── -->
    <nav class="shrink-0 bg-surface border-b border-border flex items-end px-2 gap-0.5">
      <button
        @click="activeView = 'studio'"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors duration-150"
        :class="activeView === 'studio'
          ? 'text-accent'
          : 'text-secondary hover:text-primary'"
      >
        🌀 Studio
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="activeView === 'studio' ? 'bg-accent' : 'bg-transparent'"
        />
      </button>
      <button
        @click="activeView = 'gallery'"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors duration-150"
        :class="activeView === 'gallery'
          ? 'text-accent'
          : 'text-secondary hover:text-primary'"
      >
        🔬 Gallery
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="activeView === 'gallery' ? 'bg-accent' : 'bg-transparent'"
        />
      </button>
      <span class="ml-auto mb-2 text-[10px] text-muted hidden sm:flex items-center gap-1">
        <kbd class="inline-block border border-border rounded px-1.5 py-0.5 font-mono text-[10px] text-muted">G</kbd>
        toggle
      </span>
    </nav>

    <!-- ── Studio ───────────────────────────────────────────────────────── -->
    <div
      v-show="activeView === 'studio'"
      class="flex-1 min-h-0 flex flex-col lg:flex-row"
    >
      <CanvasView class="flex-1 min-h-0" />
      <Sidebar />
      <HelpModal />
    </div>

    <!-- ── Gallery ──────────────────────────────────────────────────────── -->
    <GalleryView
      v-show="activeView === 'gallery'"
      class="flex-1 min-h-0"
    />

  </div>
</template>


