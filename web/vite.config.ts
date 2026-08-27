import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

// Prefijo público donde se sirve la app. Vacío = raíz del dominio.
// En prod lo pone el build arg BASE_PATH del Dockerfile (ver docs/vps-https.md).
const base = process.env.VITE_BASE_PATH?.trim() || '/'

export default defineConfig({
  base,
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
