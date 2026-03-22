<script setup lang="ts">
import { computed, ref } from 'vue'

import VerilogEditor from '@/components/VerilogEditor.vue'
import { BLINKY_TOP, BLINKY_VERILOG } from '@/fpga/starter'
import {
  EDITOR_FONT_DEFAULT,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  clampEditorFontSize,
} from '@/prefs/editorFont'
import { beginThemeTransition, setThemePreference, themeRef } from '@/prefs/theme'
import type { AppTheme } from '@/prefs/types'

const isDark = computed(() => themeRef.value === 'dark')
const source = ref(BLINKY_VERILOG)
const top = ref(BLINKY_TOP)
const editorFontPx = ref(EDITOR_FONT_DEFAULT)
const lineCount = computed(() => {
  if (!source.value) return 0
  return source.value.split('\n').length
})

function onTheme(next: AppTheme) {
  if (themeRef.value === next) return
  beginThemeTransition()
  setThemePreference(next)
}

function bumpFont(delta: number) {
  editorFontPx.value = clampEditorFontSize(editorFontPx.value + delta)
}
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col">
    <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
      <div class="flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="h-7 w-7" width="28" height="28">
        <h1 class="text-sm font-semibold tracking-wide text-fg">Azukar WebUSB Flasher</h1>
      </div>
      <button
        type="button"
        class="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3"
        @click="onTheme(isDark ? 'light' : 'dark')"
      >
        {{ isDark ? 'Claro' : 'Oscuro' }}
      </button>
    </header>

    <div class="flex min-h-0 flex-1 gap-4 px-4 py-3">
      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div class="flex shrink-0 items-center gap-3 border-b border-border bg-surface-2 px-3 py-1.5">
          <label class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase" for="fpga-top">
            Módulo top
          </label>
          <input
            id="fpga-top"
            v-model="top"
            class="w-40 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs"
          >
          <span class="ml-auto text-sm font-semibold text-fg">{{ lineCount }} líneas</span>
          <div class="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1">
            <button
              type="button"
              class="cursor-pointer rounded px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
              :disabled="editorFontPx <= EDITOR_FONT_MIN"
              @click="bumpFont(-1)"
            >
              A−
            </button>
            <span class="min-w-[2rem] text-center text-sm font-semibold text-fg">{{ editorFontPx }}</span>
            <button
              type="button"
              class="cursor-pointer rounded px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
              :disabled="editorFontPx >= EDITOR_FONT_MAX"
              @click="bumpFont(1)"
            >
              A+
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 p-2">
          <VerilogEditor
            v-model="source"
            :font-size="editorFontPx"
            height-class="h-full min-h-0"
          />
        </div>
      </section>

      <aside class="flex w-[min(28rem,38%)] shrink-0 flex-col rounded-xl border border-border bg-surface">
        <div class="border-b border-border px-3 py-2">
          <p class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">Grabación</p>
          <p class="mt-1 text-sm text-muted">
            El programador USB y el compile todavía no están. El PCF de Azukar v2 vive en
            <span class="font-mono text-fg">boards/azukar-v2/</span>.
          </p>
        </div>
        <pre class="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-muted">Log de síntesis y del grabado.</pre>
      </aside>
    </div>
  </div>
</template>
