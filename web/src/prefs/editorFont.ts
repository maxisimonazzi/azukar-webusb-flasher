/** Editor font size. Stored only in localStorage. */
import { ref } from 'vue'

import { readLocal, writeLocal } from '@/lib/storage'

import { EDITOR_FONT_SIZE_KEY } from './types'

export const EDITOR_FONT_MIN = 12
export const EDITOR_FONT_MAX = 22
export const EDITOR_FONT_DEFAULT = 13

export const editorFontSizeRef = ref<number>(EDITOR_FONT_DEFAULT)

export function clampEditorFontSize(n: number): number {
  if (!Number.isFinite(n)) return EDITOR_FONT_DEFAULT
  return Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(n)))
}

export function readStoredEditorFontSize(): number | null {
  const raw = readLocal(EDITOR_FONT_SIZE_KEY)
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return clampEditorFontSize(n)
}

export function resolveEditorFontSize(): number {
  return readStoredEditorFontSize() ?? EDITOR_FONT_DEFAULT
}

export function applyEditorFontSize(px: number): void {
  editorFontSizeRef.value = clampEditorFontSize(px)
}

export function writeEditorFontSize(px: number): void {
  writeLocal(EDITOR_FONT_SIZE_KEY, String(clampEditorFontSize(px)))
}

export function setEditorFontSizePreference(px: number): void {
  const next = clampEditorFontSize(px)
  writeEditorFontSize(next)
  applyEditorFontSize(next)
}

export function initEditorFontSize(): number {
  const px = resolveEditorFontSize()
  applyEditorFontSize(px)
  return px
}
