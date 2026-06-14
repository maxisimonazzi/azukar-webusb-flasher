import type { AppLocale } from './types'
import { LOCALE_KEY } from './types'

export function readStoredLocale(): AppLocale | null {
  const value = localStorage.getItem(LOCALE_KEY)
  return value === 'en' || value === 'es' ? value : null
}

export function systemLocale(): AppLocale {
  const lang = navigator.language?.toLowerCase() ?? 'en'
  return lang.startsWith('es') ? 'es' : 'en'
}

export function resolveLocale(): AppLocale {
  return readStoredLocale() ?? systemLocale()
}

export function writeLocale(locale: AppLocale): void {
  localStorage.setItem(LOCALE_KEY, locale)
}

export function setLocalePreference(locale: AppLocale): void {
  writeLocale(locale)
}
