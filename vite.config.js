import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['gun', 'gun/sea'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
})
