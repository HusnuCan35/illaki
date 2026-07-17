import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    // Fix Gun.js global usage in browser
    global: 'globalThis',
  },
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
  },
})
