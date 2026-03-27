<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import CanvasView from "./components/CanvasView.vue";
import Sidebar from "./components/Sidebar.vue";
import HelpModal from "./components/HelpModal.vue";
import GalleryView from "./components/GalleryView.vue";
import {
  rendererRef, running, resetAll, exportPNG,
  showMachine, showHelp, liveMode,
} from "./store";

type View = "studio" | "gallery";
const activeView = ref<View>("studio");

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
    <nav class="shrink-0 flex items-center gap-1 px-3 py-2 bg-surface border-b border-border">
      <button
        @click="activeView = 'studio'"
        class="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors duration-150"
        :class="activeView === 'studio'
          ? 'bg-accent/15 text-accent border border-accent/30'
          : 'text-secondary hover:text-primary hover:bg-elevated border border-transparent'"
      >
        🌀 Studio
      </button>
      <button
        @click="activeView = 'gallery'"
        class="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors duration-150"
        :class="activeView === 'gallery'
          ? 'bg-accent/15 text-accent border border-accent/30'
          : 'text-secondary hover:text-primary hover:bg-elevated border border-transparent'"
      >
        🔬 Gallery
      </button>
      <span class="ml-auto text-[10px] text-muted hidden sm:block">
        <kbd class="inline-block border border-border rounded px-1 py-0.5 font-mono text-[10px] text-muted">G</kbd> toggle view
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


