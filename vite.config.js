import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  optimizeDeps: {
    include: ['gun', 'gun/sea'],
    rolldownOptions: {
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
