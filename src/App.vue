<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import CanvasView from "./components/CanvasView.vue";
import Sidebar from "./components/Sidebar.vue";
import HelpModal from "./components/HelpModal.vue";
import {
  rendererRef, running, resetAll, exportPNG,
  showMachine, showHelp, liveMode,
} from "./store";

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

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
  <div class="h-full flex flex-col lg:flex-row">
    <CanvasView class="flex-1 min-h-0" />
    <Sidebar />
    <HelpModal />
  </div>
</template>
