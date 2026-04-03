<script setup lang="ts">
const { loadedFromExpId } = useStore();
</script>

<template>
  <aside
    class="w-full lg:w-[480px] shrink-0 overflow-y-auto bg-surface border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col gap-4 text-sm transition-colors duration-400"
  >
    <!-- "Loaded from gallery" banner -->
    <Transition name="slide-banner">
      <div v-if="loadedFromExpId !== null"
        class="-mx-1 flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent rounded-xl px-3 py-2 text-xs animate-fade-in">
        <span class="text-base leading-none">🚀</span>
        <span class="flex-1">Loaded experiment <strong>#{{ String(loadedFromExpId).padStart(4, '0') }}</strong> — tweak away!</span>
        <button @click="loadedFromExpId = null" class="text-accent/60 hover:text-accent transition-colors leading-none text-base">×</button>
      </div>
    </Transition>

    <!-- Header -->
    <div class="flex items-center justify-between animate-fade-in">
      <h1 class="text-base font-semibold tracking-tight text-primary">
        🌀 Spiralux
      </h1>
      <ThemeSwitcher />
    </div>

    <!-- Presets -->
    <PresetSelector :style="{ animationDelay: '30ms' }" />

    <!-- Machine view + Gear controls side-by-side -->
    <div class="animate-fade-in" :style="{ animationDelay: '80ms' }">
      <MachineGearPanel />
    </div>

    <!-- Drive & Table globals -->
    <GlobalControls :style="{ animationDelay: '130ms' }" />

    <!-- Color generator -->
    <ColorGenerator :style="{ animationDelay: '180ms' }" />

    <div class="h-2 shrink-0" />
  </aside>
</template>

<style scoped>
.slide-banner-enter-active, .slide-banner-leave-active {
  transition: all 0.25s ease;
}
.slide-banner-enter-from, .slide-banner-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}
.slide-banner-enter-to, .slide-banner-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 60px;
}
</style>
