import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      // Anything starting with /api goes to hunajapannu.fi
      '/api': {
        target: 'https://hunajapannu.fi',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
