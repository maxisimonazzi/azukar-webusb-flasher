export type AppLocale = 'en' | 'es'
export type AppTheme = 'light' | 'dark'

export const APP_PALETTES = [
  'amber',
  'cyan',
  'sky',
  'red',
  'violet',
  'orange',
  'green',
  'yellow',
] as const

export type AppPalette = (typeof APP_PALETTES)[number]

/** Suffixes. Full keys are lattice.<name> (legacy azukar.<name> is migrated). */
export const LOCALE_KEY = 'locale'
export const THEME_KEY = 'theme'
export const PALETTE_KEY = 'palette'
export const EDITOR_FONT_SIZE_KEY = 'editorFontSize'
export const FIREFOX_NOTICE_KEY = 'firefoxNotice'
