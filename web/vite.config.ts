import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['@yowasp/yosys', '@yowasp/nextpnr-ice40'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@boards': path.resolve(root, '../boards'),
    },
  },
})
