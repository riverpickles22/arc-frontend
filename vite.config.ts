import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The canon API and the world-shaping agent live in arc-backend. In dev we
// proxy /api to it so the app stays same-origin; in production point the
// deployed frontend at the backend however your host does routing.
const BACKEND = process.env.ARC_BACKEND_URL ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
    },
  },
})
