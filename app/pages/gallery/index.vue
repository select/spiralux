<script setup lang="ts">
import type { Experiment } from "~/utils/experiments";
import type { TargetInfo } from "~/utils/targets";

const search = ref("");
const sortDesc = ref(true);

const { data: experiments, status: expStatus } = useFetch<Experiment[]>("/api/experiments");
const { data: targets } = useFetch<TargetInfo[]>("/api/targets");

const allTargets = computed(() => targets.value ?? []);

function getTargetInfo(file: string): TargetInfo {
  return allTargets.value.find(t => t.file === file) ?? makeTargetInfo(file);
}

// Count experiments per target
const countByTarget = computed(() => {
  const m: Record<string, number> = {};
  for (const e of experiments.value ?? []) m[e.target] = (m[e.target] ?? 0) + 1;
  return m;
});

const filtered = computed(() => {
  let list = [...(experiments.value ?? [])];
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    list = list.filter(e =>
      e.notes.toLowerCase().includes(q) ||
      String(e.id).includes(q) ||
      e.xArmGears.toLowerCase().includes(q) ||
      e.yArmGears.toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => sortDesc.value ? b.id - a.id : a.id - b.id);
  return list;
});

const targetCardsToShow = computed<TargetInfo[]>(() => {
  const seen = new Set<string>();
  const result: TargetInfo[] = [];
  for (const e of experiments.value ?? []) {
    if (!seen.has(e.target)) { seen.add(e.target); result.push(getTargetInfo(e.target)); }
  }
  return result.length ? result : allTargets.value.slice(0, 1);
});

async function reload() {
  await refreshNuxtData();
}
</script>

<template>
  <div class="flex flex-col h-full bg-base text-primary">

    <!-- ── Header row 1: title + search + sort + refresh ──────────────── -->
    <div class="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex flex-wrap items-center gap-2.5">
      <div class="flex items-center gap-2 mr-1">
        <span class="text-base">🔬</span>
        <span class="font-semibold text-primary text-sm tracking-tight">Experiments</span>
        <span v-if="expStatus === 'success'" class="text-xs bg-elevated text-secondary rounded-full px-2 py-0.5">
          {{ (experiments ?? []).length }}
        </span>
      </div>

      <div class="flex-1 min-w-[130px] max-w-xs relative">
        <input v-model="search" type="search" placeholder="Search notes, gears…"
          class="w-full bg-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-border-focus transition-colors" />
        <span v-if="search" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-[10px]">{{ filtered.length }}</span>
      </div>

      <button @click="sortDesc = !sortDesc"
        class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-2.5 py-1.5 transition-colors">
        {{ sortDesc ? "↓ Newest" : "↑ Oldest" }}
      </button>

      <button @click="reload" :disabled="expStatus === 'pending'"
        class="text-xs text-secondary hover:text-primary bg-elevated border border-border rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">
        {{ expStatus === 'pending' ? '…' : '⟳ Reload' }}
      </button>
    </div>

    <!-- ── Header row 2: target filter tabs ───────────────────────────── -->
    <div class="shrink-0 bg-surface border-b-2 border-border overflow-x-auto">
      <div class="flex items-end px-3 gap-0.5 min-w-max">
        <!-- All tab (current page = active) -->
        <NuxtLink to="/gallery"
          class="relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap text-accent">
          <span class="text-base leading-none">⊞</span>
          All
          <span class="text-[10px] font-normal opacity-60 ml-0.5">{{ (experiments ?? []).length }}</span>
          <span class="absolute bottom-0 inset-x-0 h-0.5 rounded-t bg-accent" />
        </NuxtLink>

        <!-- Per-target tabs -->
        <NuxtLink v-for="t in allTargets" :key="t.file"
          :to="`/gallery/target/${toSlug(t.label)}`"
          class="relative flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap text-secondary hover:text-primary group">
          <div class="w-8 h-8 rounded-md overflow-hidden border-2 shrink-0 transition-all border-border/60 group-hover:border-border-focus"
            :style="{ background: t.bg }">
            <img :src="`/target/${t.file}`" :alt="t.label" class="w-full h-full object-cover opacity-70 group-hover:opacity-90" />
          </div>
          <div class="flex flex-col items-start">
            <span>{{ t.label }}</span>
            <span class="text-[9px] font-normal opacity-50 leading-none mt-0.5">
              {{ countByTarget[t.file] ?? 0 }} exp · {{ difficultyStars(t.difficulty) }}
            </span>
          </div>
          <span class="absolute bottom-0 inset-x-0 h-0.5 rounded-t bg-transparent" />
        </NuxtLink>
      </div>
    </div>

    <!-- ── Content ─────────────────────────────────────────────────────── -->
    <div class="flex-1 min-h-0 overflow-y-auto px-4 py-4">

      <div v-if="expStatus === 'error'" class="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span class="text-3xl">⚠️</span>
        <p class="text-sm text-secondary">Failed to load experiments</p>
        <button @click="reload" class="text-xs text-accent hover:underline">Try again</button>
      </div>

      <div v-else-if="expStatus === 'pending'" class="flex items-center justify-center h-64 text-secondary text-sm">
        Loading experiments…
      </div>

      <div v-else-if="filtered.length === 0 && !search" class="flex flex-col items-center justify-center h-64 gap-2 text-secondary text-sm">
        <span class="text-3xl">🔬</span>
        <p>No experiments yet.</p>
        <code class="text-xs text-muted bg-elevated px-3 py-1.5 rounded">pnpm render -- --notes "first attempt"</code>
      </div>

      <div v-else-if="filtered.length === 0" class="flex flex-col items-center justify-center h-64 gap-2 text-secondary text-sm">
        <span class="text-3xl">🔍</span>
        <p>No results for "<span class="text-primary">{{ search }}</span>"</p>
        <button @click="search = ''" class="text-xs text-accent hover:underline">Clear</button>
      </div>

      <div v-else class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))">
        <!-- Target reference cards -->
        <TargetCard v-for="t in targetCardsToShow" :key="t.file"
          :target="t" :count="countByTarget[t.file] ?? 0" />

        <!-- Experiment cards -->
        <GalleryCard v-for="exp in filtered" :key="exp.id"
          :exp="exp" :target="getTargetInfo(exp.target)" :show-target-label="true" />
      </div>
    </div>
  </div>
</template>
