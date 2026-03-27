<script setup lang="ts">
import { computed } from "vue";
import MachineView from "./MachineView.vue";
import CompactGearSlider from "./CompactGearSlider.vue";
import { config, showMachine, addGear, removeGear } from "../store";
import { gearSpeeds } from "../engine";

const armDefs = computed(() => [
  {
    axis: "x" as const,
    label: "X Arm",
    dotClass: "bg-rose-400",
    textClass: "text-rose-400",
    borderClass: "border-rose-400/30",
    gears: config.xArm.gears,
    speeds: gearSpeeds(config.xArm, config.driveTeeth),
  },
  {
    axis: "y" as const,
    label: "Y Arm",
    dotClass: "bg-sky-400",
    textClass: "text-sky-400",
    borderClass: "border-sky-400/30",
    gears: config.yArm.gears,
    speeds: gearSpeeds(config.yArm, config.driveTeeth),
  },
]);
</script>

<template>
  <div class="flex gap-2 h-72">

    <!-- Left: animated machine canvas (hidden when showMachine is off) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="opacity-0 w-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 w-0"
    >
      <div
        v-if="showMachine"
        class="w-[44%] shrink-0 rounded-xl overflow-hidden bg-canvas/60 border border-border backdrop-blur-sm relative"
      >
        <MachineView />
      </div>
    </Transition>

    <!-- Right: compact gear controls, scrollable -->
    <div class="flex-1 min-w-0 overflow-y-auto rounded-xl bg-elevated/40 border border-border space-y-3 p-2.5">

      <div
        v-for="arm in armDefs"
        :key="arm.axis"
        class="space-y-1.5"
      >
        <!-- Arm header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="arm.dotClass" />
            <span class="text-[10px] font-bold uppercase tracking-widest" :class="arm.textClass">
              {{ arm.label }}
            </span>
          </div>
          <button
            v-if="arm.gears.length < 4"
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium cursor-pointer transition-all duration-150 border"
            :class="`${arm.textClass} border-current/30 hover:bg-current/10 opacity-70 hover:opacity-100`"
            :title="`Add gear to ${arm.label}`"
            @click="addGear(arm.axis)"
          >+ gear</button>
        </div>

        <!-- Gear chain -->
        <div class="space-y-1.5">
          <div
            v-for="(gear, gi) in arm.gears"
            :key="gi"
            class="rounded-lg border p-2 space-y-0.5 relative"
            :class="arm.borderClass"
          >
            <!-- Gear header row -->
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1">
                <!-- Belt indicator -->
                <span
                  v-if="gi > 0"
                  class="text-[9px] text-red-400/70 mr-0.5"
                  title="Belt-connected to previous gear"
                >⊃</span>
                <span class="text-[10px] font-medium text-secondary">
                  {{ gi + 1 }}
                </span>
                <span class="text-[9px] text-muted">
                  ×{{ (arm.speeds[gi] ?? 1).toFixed(2) }} speed
                </span>
              </div>
              <button
                v-if="arm.gears.length > 1"
                class="w-4 h-4 flex items-center justify-center rounded text-[9px] text-muted hover:text-red-400 hover:bg-red-400/10 cursor-pointer transition-colors"
                :title="`Remove gear ${gi + 1}`"
                @click="removeGear(arm.axis, gi)"
              >✕</button>
            </div>

            <CompactGearSlider
              v-model="gear.teeth"
              label="T"
              :min="10"
              :max="150"
              :step="1"
              :decimals="0"
            />
            <CompactGearSlider
              v-model="gear.crankRadius"
              label="R"
              :min="0"
              :max="200"
              :step="1"
              :decimals="0"
            />
            <CompactGearSlider
              v-model="gear.phase"
              label="φ"
              :min="0"
              :max="6.283"
              :step="0.05"
              :decimals="2"
            />
          </div>
        </div>

      </div>
    </div>

  </div>
</template>
