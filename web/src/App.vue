<script setup lang="ts">
import { computed } from 'vue'

import { beginThemeTransition, setThemePreference, themeRef } from '@/prefs/theme'
import type { AppTheme } from '@/prefs/types'

const isDark = computed(() => themeRef.value === 'dark')

function onTheme(next: AppTheme) {
  if (themeRef.value === next) return
  beginThemeTransition()
  setThemePreference(next)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header
      class="flex items-center justify-between border-b border-border px-5 py-3"
    >
      <div class="flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="h-8 w-8" width="32" height="32">
        <div>
          <p class="text-sm font-semibold tracking-wide text-fg">Azukar</p>
          <p class="text-[0.65rem] font-bold tracking-[0.16em] text-muted uppercase">
            WebUSB Flasher
          </p>
        </div>
      </div>
      <button
        type="button"
        class="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3"
        @click="onTheme(isDark ? 'light' : 'dark')"
      >
        {{ isDark ? 'Claro' : 'Oscuro' }}
      </button>
    </header>

    <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
      <p class="text-[0.65rem] font-bold tracking-[0.18em] text-primary uppercase">
        iCE40 · FT2232H
      </p>
      <h1 class="mt-3 font-sans text-4xl font-bold tracking-tight text-fg">
        Grabar una Azukar desde el navegador.
      </h1>
      <p class="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Stack de un contenedor con Yosys, nextpnr-ice40 e icepack.
        El USB lo habla Chrome en esta PC, no Docker.
        El editor y el programador van a vivir acá.
      </p>
      <ul class="mt-10 grid gap-3 text-sm text-fg sm:grid-cols-3">
        <li class="rounded-xl border border-border bg-surface p-4">
          <p class="font-mono text-xs text-primary">yosys</p>
          <p class="mt-1 text-muted">Síntesis synth_ice40</p>
        </li>
        <li class="rounded-xl border border-border bg-surface p-4">
          <p class="font-mono text-xs text-primary">nextpnr</p>
          <p class="mt-1 text-muted">hx8k · tq144:4k</p>
        </li>
        <li class="rounded-xl border border-border bg-surface p-4">
          <p class="font-mono text-xs text-primary">icepack</p>
          <p class="mt-1 text-muted">Bitstream .bin</p>
        </li>
      </ul>
    </main>
  </div>
</template>
