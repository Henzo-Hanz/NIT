import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
    allowedHosts: [os.hostname(), '.local'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // perf_* mede o próprio teto (20s) e estoura o default de 5s sob carga
    // paralela; o timeout do harness acompanha o orçamento do teste.
    testTimeout: 20000,
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
