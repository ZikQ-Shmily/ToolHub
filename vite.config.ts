import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  base: './', // 适配 file://（绿色版）
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/release/**', '**/dist/**'],
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
})
