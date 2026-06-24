import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // In local dev, proxy /api to the Vercel dev server (vercel dev runs on 3000).
      // Run: vercel dev (in one terminal) + vite (in another)
      '/api': 'http://localhost:3000',
    },
  },
})
