import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      output: {
        // Recharts is the bulk of the bundle and only the trend chart needs
        // it; keeping it in its own chunk (loaded lazily) stops it blocking
        // first paint. React is split out too so it caches across deploys.
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['recharts'],
        },
      },
    },
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
