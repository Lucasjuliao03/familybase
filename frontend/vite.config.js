import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /** Capacitor WebView precisa de paths relativos; Vercel/browser precisa de `/`. */
  const isCapacitorBuild = mode === 'capacitor' || process.env.CAPACITOR_BUILD === 'true';
  const base = isCapacitorBuild ? './' : '/';

  return {
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  base,

  plugins: [
    react(),

    VitePWA({
      strategies: 'generateSW',
      /** Nova build fica “waiting”; o usuário confirma com registerSW/onNeedRefresh. */
      registerType: 'prompt',
      injectRegister: false,

      manifest: {
        name: 'Tudo de Família',
        short_name: 'Tudo de Família',
        lang: 'pt-BR',
        description: 'Gestão familiar, tarefas, mesada, saúde e rotina',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/login',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png',                      sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png',                      sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // Public marketing and prices must use the current document from the network.
        navigateFallbackDenylist: [/^\/(?:\?.*)?$/],
        skipWaiting: false,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        /** Handlers de push (antes em public/sw.js; o SW efetivo é gerido pelo plugin). */
        importScripts: ['/sw-push-import.js'],
        runtimeCaching: [
          /*
           * Pedidos ao Supabase: sem cache no SW (Auth / REST / Realtime handshake / Functions / Storage no host *.supabase.co).
           * Também não cachear proxy /api/supabase/*.
           * Apenas fontes externas ficam CacheFirst por performance.
           */
          {
            // Todo o host público Supabase (auth/rest/realtime via fetch, storage, functions) — sempre rede; evita SPA “presa”.
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/supabase\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },

      devOptions: { enabled: false }, // desativa SW em dev para evitar conflitos com HMR
    }),
  ],

  server: {
    port: 5173,
    fs: { strict: true, allow: [fileURLToPath(new URL('.', import.meta.url))] },
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
          if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) {
            return 'vendor-react';
          }
          // Supabase — isolado para não misturar com o código da app
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-')) return 'vendor-charts';
          if (id.includes('/node_modules/leaflet/') || id.includes('/node_modules/react-leaflet/')) return 'vendor-maps';
          if (id.includes('/node_modules/jspdf')) return 'vendor-pdf';
          // Preserve independent lazy chunks, including the public landing.
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
  },
  };
});
