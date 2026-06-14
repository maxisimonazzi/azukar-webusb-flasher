import { createApp } from 'vue'

import App from './App.vue'
import { i18n } from './i18n'
import { initEditorFontSize } from './prefs/editorFont'
import { resolveLocale } from './prefs/locale'
import { initTheme } from './prefs/theme'
import './style.css'

initTheme()
initEditorFontSize()
document.documentElement.lang = resolveLocale()
createApp(App).use(i18n).mount('#app')
