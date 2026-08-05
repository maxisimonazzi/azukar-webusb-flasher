<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  PALETTE_SWATCH,
  paletteRef,
  setPalettePreference,
} from '@/prefs/palette'
import { beginThemeTransition } from '@/prefs/theme'
import { APP_PALETTES, type AppPalette } from '@/prefs/types'

const { t } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function paletteLabel(id: AppPalette): string {
  switch (id) {
    case 'amber':
      return t('app.palette.amber')
    case 'cyan':
      return t('app.palette.cyan')
    case 'sky':
      return t('app.palette.sky')
    case 'red':
      return t('app.palette.red')
    case 'violet':
      return t('app.palette.violet')
    case 'orange':
      return t('app.palette.orange')
    case 'green':
      return t('app.palette.green')
    case 'yellow':
      return t('app.palette.yellow')
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}

const currentLabel = computed(() => paletteLabel(paletteRef.value))

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function pick(id: AppPalette) {
  if (paletteRef.value !== id) {
    beginThemeTransition()
    setPalettePreference(id)
  }
  close()
}

function itemClass(id: AppPalette): string {
  const active = paletteRef.value === id
  return [
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
    active ? 'bg-primary/15 text-fg' : 'text-fg hover:bg-surface-2',
  ].join(' ')
}

function onPointer(ev: PointerEvent) {
  const node = ev.target
  if (!(node instanceof Node) || root.value?.contains(node)) return
  close()
}

onMounted(() => document.addEventListener('pointerdown', onPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointer))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-fg transition-colors hover:bg-surface-2"
      :aria-expanded="open"
      :aria-label="t('app.paletteGroup')"
      :title="t('app.paletteGroup')"
      @click="toggle"
    >
      <span
        class="h-4 w-4 shrink-0 rounded-full border border-border-strong"
        :style="{ background: PALETTE_SWATCH[paletteRef] }"
        aria-hidden="true"
      />
      <span class="hidden text-xs font-semibold sm:inline">{{ currentLabel }}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="h-3.5 w-3.5 shrink-0 text-muted"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
      role="listbox"
      :aria-label="t('app.paletteGroup')"
    >
      <button
        v-for="id in APP_PALETTES"
        :key="id"
        type="button"
        role="option"
        :aria-selected="paletteRef === id"
        :class="itemClass(id)"
        @click="pick(id)"
      >
        <span
          class="h-3.5 w-3.5 shrink-0 rounded-full border border-border"
          :style="{ background: PALETTE_SWATCH[id] }"
          aria-hidden="true"
        />
        <span>{{ paletteLabel(id) }}</span>
      </button>
    </div>
  </div>
</template>
