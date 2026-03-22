import { createApp } from 'vue'

import App from './App.vue'
import { initEditorFontSize } from './prefs/editorFont'
import { initTheme } from './prefs/theme'
import './style.css'

initTheme()
initEditorFontSize()
createApp(App).mount('#app')
