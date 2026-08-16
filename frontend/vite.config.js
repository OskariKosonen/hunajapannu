import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      output: {
        // React in its own chunk so it stays cached across deploys. The
        // charting library that used to dominate this bundle is gone — the
        // trend chart is now plain SVG.
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },

  server: {
    proxy: {
      // Anything starting with /api goes to production by default; set
      // VITE_API_TARGET to develop against a locally running backend.
      '/api': {
        target: process.env.VITE_API_TARGET || 'https://hunajapannu.fi',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
