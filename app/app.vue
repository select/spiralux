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
        🌀 Studio
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="$route.path === '/' ? 'bg-accent' : 'bg-transparent'"
        />
      </NuxtLink>
      <NuxtLink
        to="/gallery"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors duration-150"
        :class="$route.path.startsWith('/gallery') ? 'text-accent' : 'text-secondary hover:text-primary'"
      >
        🔬 Gallery
        <span
          class="absolute bottom-0 inset-x-0 h-0.5 rounded-t transition-all duration-150"
          :class="$route.path.startsWith('/gallery') ? 'bg-accent' : 'bg-transparent'"
        />
      </NuxtLink>
      <span class="ml-auto mb-2 text-[10px] text-muted hidden sm:flex items-center gap-1">
        <kbd class="inline-block border border-border rounded px-1.5 py-0.5 font-mono text-[10px] text-muted">G</kbd>
        toggle
      </span>
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
      if (route.path.startsWith("/gallery")) {
        router.push("/");
      } else {
        router.push("/gallery");
      }
    }
  });
}
</script>
