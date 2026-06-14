import { createI18n } from 'vue-i18n'

import { resolveLocale } from '@/prefs/locale'

import en from './locales/en.json'
import es from './locales/es.json'

export const i18n = createI18n({
  legacy: false,
  locale: resolveLocale(),
  fallbackLocale: 'en',
  messages: { en, es },
})
