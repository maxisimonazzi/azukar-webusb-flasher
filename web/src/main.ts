import { createApp } from 'vue'

import App from './App.vue'
import { initTheme } from './prefs/theme'
import './style.css'

initTheme()
createApp(App).mount('#app')
