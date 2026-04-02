<script setup lang="ts">
import { loadSavedTheme } from "~/utils/themes";

onMounted(() => {
  loadSavedTheme();
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- ── Nav bar ──────────────────────────────────────────────────────── -->
    <nav class="shrink-0 bg-surface border-b border-border flex items-end px-2 gap-0.5">
      <NuxtLink
        to="/"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors duration-150"
        :class="$route.path === '/' ? 'text-accent' : 'text-secondary hover:text-primary'"
      >
        <i class="i-mdi-vector-bezier inline-block mr-1" /> Bezier
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="$route.path === '/' ? 'bg-accent' : 'bg-transparent'"
        />
      </NuxtLink>
      <NuxtLink
        to="/studio"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors duration-150"
        :class="$route.path === '/studio' ? 'text-accent' : 'text-secondary hover:text-primary'"
      >
        <i class="i-mdi-cog-outline inline-block mr-1" /> Studio
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="$route.path === '/studio' ? 'bg-accent' : 'bg-transparent'"
        />
      </NuxtLink>
      <NuxtLink
        to="/gallery"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors duration-150"
        :class="$route.path.startsWith('/gallery') ? 'text-accent' : 'text-secondary hover:text-primary'"
      >
        <i class="i-mdi-image-multiple-outline inline-block mr-1" /> Gallery
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="$route.path.startsWith('/gallery') ? 'bg-accent' : 'bg-transparent'"
        />
      </NuxtLink>
    </nav>

    <!-- ── Page content ─────────────────────────────────────────────────── -->
    <div class="flex-1 min-h-0">
      <NuxtPage class="h-full" />
    </div>
  </div>
</template>

<script lang="ts">
// Global keyboard shortcut: G to toggle studio ↔ gallery
if (import.meta.client) {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "g" || e.key === "G") {
      const router = useRouter();
      const route = useRoute();
      // Cycle: / → /studio → /gallery → /
      if (route.path === "/") router.push("/studio");
      else if (route.path === "/studio") router.push("/gallery");
      else router.push("/");
    }
  });
}
</script>
