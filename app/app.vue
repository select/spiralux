<script setup lang="ts">
import { loadSavedTheme } from "~/utils/themes";

const showMenu = ref(false);
const route = useRoute();

onMounted(() => {
  loadSavedTheme();
});

function navigate(path: string) {
  showMenu.value = false;
  navigateTo(path);
}
</script>

<template>
  <div class="h-full relative">
    <!-- Hamburger button -->
    <button
      class="fixed top-2 left-2 z-50 w-8 h-8 flex items-center justify-center rounded-lg bg-surface/80 backdrop-blur border border-border/40 hover:bg-elevated/80 transition-all cursor-pointer"
      @click="showMenu = !showMenu"
    >
      <i class="i-mdi-menu text-lg text-secondary" />
    </button>

    <!-- Dropdown menu -->
    <Transition name="menu">
      <div
        v-if="showMenu"
        class="fixed top-11 left-2 z-50 min-w-40 bg-surface border border-border/60 rounded-lg shadow-lg overflow-hidden"
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

    <!-- Click-outside to close menu -->
    <div v-if="showMenu" class="fixed inset-0 z-40" @click="showMenu = false" />

    <NuxtPage class="h-full" />
  </div>
</template>

<style scoped>
.menu-enter-active, .menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.menu-enter-from, .menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
