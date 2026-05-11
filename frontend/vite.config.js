import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    react(),
    VitePWA({
      // Use our custom sw.js in public folder
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      // Don't auto-generate manifest - we have our own
      manifest: false,
      injectManifest: {
        // Inject precache manifest into our sw.js
        globDirectory: 'dist',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    }
  }
})
