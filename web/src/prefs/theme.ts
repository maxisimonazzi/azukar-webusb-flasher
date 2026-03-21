import { ref } from 'vue'

import type { AppTheme } from './types'
import { THEME_KEY } from './types'

export const themeRef = ref<AppTheme>('dark')

export function readStoredTheme(): AppTheme | null {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function resolveTheme(): AppTheme {
  return readStoredTheme() ?? 'dark'
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  themeRef.value = theme
}

export function writeTheme(theme: AppTheme): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function beginThemeTransition(): void {
  const root = document.documentElement
  root.classList.add('theme-transition')
  window.setTimeout(() => {
    root.classList.remove('theme-transition')
  }, 280)
}

export function setThemePreference(theme: AppTheme): void {
  writeTheme(theme)
  applyTheme(theme)
}

export function initTheme(): AppTheme {
  const theme = resolveTheme()
  applyTheme(theme)
  return theme
}
