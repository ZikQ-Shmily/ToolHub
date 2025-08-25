import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // 适配 file://（绿色版）
  base: './',
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
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true,
    target: 'es2020',          // 与 Electron 运行时匹配，减少转译负担
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,    // 去除 console
        drop_debugger: true    // 去除 debugger
      }
    },
    rollupOptions: {
      output: {
        // 将 node_modules 打到一个 vendor 包里，安装包压缩率更高
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  }
})
