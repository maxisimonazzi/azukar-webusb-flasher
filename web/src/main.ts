import { createApp } from 'vue'

import App from './App.vue'
import { i18n } from './i18n'
import { initEditorFontSize } from './prefs/editorFont'
import { resolveLocale } from './prefs/locale'
import { initPalette } from './prefs/palette'
import { initTheme } from './prefs/theme'
import './style.css'

initTheme()
initPalette()
initEditorFontSize()
document.documentElement.lang = resolveLocale()
createApp(App).use(i18n).mount('#app')
