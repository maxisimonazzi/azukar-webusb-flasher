import { ref } from 'vue'

import { readLocal, writeLocal } from '@/lib/storage'

import type { AppPalette } from './types'
import { APP_PALETTES, PALETTE_KEY } from './types'

export const PALETTE_DEFAULT: AppPalette = 'amber'

/** Signature swatch for the picker; independent of the live theme tokens. */
export const PALETTE_SWATCH: Record<AppPalette, string> = {
  amber: 'oklch(0.82 0.1 72)',
  cyan: 'oklch(0.72 0.12 200)',
  sky: 'oklch(0.7 0.12 240)',
  red: 'oklch(0.6 0.22 25)',
  violet: 'oklch(0.68 0.14 305)',
  orange: 'oklch(0.72 0.2 52)',
  green: 'oklch(0.7 0.14 145)',
  yellow: 'oklch(0.82 0.14 95)',
}

export const paletteRef = ref<AppPalette>(PALETTE_DEFAULT)

export function isAppPalette(value: string | null | undefined): value is AppPalette {
  return value != null && (APP_PALETTES as readonly string[]).includes(value)
}

export function readStoredPalette(): AppPalette | null {
  const value = readLocal(PALETTE_KEY)
  return isAppPalette(value) ? value : null
}

export function resolvePalette(): AppPalette {
  return readStoredPalette() ?? PALETTE_DEFAULT
}

export function applyPalette(palette: AppPalette): void {
  document.documentElement.dataset.palette = palette
  paletteRef.value = palette
}

export function writePalette(palette: AppPalette): void {
  writeLocal(PALETTE_KEY, palette)
}

export function setPalettePreference(palette: AppPalette): void {
  writePalette(palette)
  applyPalette(palette)
}

export function initPalette(): AppPalette {
  const palette = resolvePalette()
  applyPalette(palette)
  return palette
}
