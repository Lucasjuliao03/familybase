import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],

  plugins: [
    react(),

    VitePWA({
      strategies: 'generateSW',
      /** Nova build fica “waiting”; o usuário confirma com registerSW/onNeedRefresh. */
      registerType: 'prompt',
      injectRegister: false,

      manifest: {
        name: 'Base Familiar',
        short_name: 'Base Familiar',
        description: 'Gestão familiar, tarefas, mesada, saúde e rotina',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png',                      sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png',                      sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        /** Handlers de push (antes em public/sw.js; o SW efetivo é gerido pelo plugin). */
        importScripts: ['/sw-push-import.js'],
        runtimeCaching: [
          {
            // NUNCA incluir /auth/v1/ — cache de refresh token quebra sessão e gera erros no bundle (ex.: pages-child).
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/(rest\/v1|storage\/v1|functions\/v1)\//i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api', networkTimeoutSeconds: 10 },
          },
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/supabase\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api-proxy', networkTimeoutSeconds: 10 },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },

      devOptions: { enabled: false }, // desativa SW em dev para evitar conflitos com HMR
    }),
  ],

  server: {
    port: 5173,
    proxy: {
      '/api/supabase': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: true, // exibe erros de compilação como overlay no browser
    },
    watch: {
      usePolling: false, // polling apenas se em WSL/VM; deixe false para desempenho nativo
    },
  },

  build: {
    // Divide o bundle em chunks por rota/módulo para carregamento mais rápido
    rollupOptions: {
      output: {
        // manualChunks DEVE ser uma função (Rollup ≥ 4 / Vite ≥ 5 rejeitam objeto)
        manualChunks(id) {
          // Vendors React — cache longo, raramente muda
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          // Supabase — isolado para não misturar com o código da app
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // Outros node_modules juntos
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
          // Páginas do pai
          if (id.includes('/pages/parent/')) return 'pages-parent';
          // Páginas do filho
          if (id.includes('/pages/child/'))  return 'pages-child';
          // Outros módulos partilhados (Health, Mural, Master…)
          if (id.includes('/pages/'))        return 'pages-shared';
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
  },
})
