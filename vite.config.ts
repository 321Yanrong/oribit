import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

const PWA_CACHE_VERSION = 'orbit-pwa-v3-20260314';
const runtimeVersionSuffix = `-${PWA_CACHE_VERSION}`;

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version || '0.0.0'),
    'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      // 在离线或导航失败时返回 offline.html 作为兜底
      workbox: {
        cacheId: PWA_CACHE_VERSION,
        // Allow precaching slightly larger bundles (default 2 MiB)
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: null, // disable default index fallback so custom handler runs
        runtimeCaching: [
          {
            // 导航请求：在线优先，失败则离线页（即使已有缓存也会走离线页）
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
            options: {
              cacheName: `navigate-network-only${runtimeVersionSuffix}`,
              plugins: [
                {
                  handlerDidError: async () => {
                    const cached = await (globalThis as any).caches.match('/offline.html'); // Added type assertion to fix TypeScript error
                    return cached;
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.origin === 'https://qoaqmbepnsqymxzpncyf.supabase.co' &&
              url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: `supabase-rest-get${runtimeVersionSuffix}`,
              networkTimeoutSeconds: 4,
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 5,
              },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.origin === 'https://qoaqmbepnsqymxzpncyf.supabase.co' &&
              url.pathname.startsWith('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: `supabase-public-storage${runtimeVersionSuffix}`,
              cacheableResponse: {
                // Avoid caching opaque responses (status 0) so CORS fetches don't receive opaque responses from cache
                statuses: [200],
              },
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: `unsplash-images${runtimeVersionSuffix}`,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/api\.dicebear\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: `dicebear-avatars${runtimeVersionSuffix}`,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Orbit 轨迹',
        short_name: 'Orbit',
        description: '一款专为密友圈设计的情感地图手账 + 极简记账数字胶囊',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#00FFB3',
        background_color: '#121212',
        categories: ['social', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }
        ],
        screenshots: [
          {
            src: 'screenshots/app/home-1.png',
            sizes: '1170x2532',
            type: 'image/png',
            form_factor: 'narrow',
            label: '主页与记忆流'
          },
          {
            src: 'screenshots/app/map-1.png',
            sizes: '1170x2532',
            type: 'image/png',
            form_factor: 'narrow',
            label: '地图足迹'
          }
        ],
        shortcuts: [
          {
            name: '快速记忆',
            short_name: '记忆',
            url: '/?from=shortcut-memory',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '打开地图',
            short_name: '地图',
            url: '/?from=shortcut-map',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    sourcemap: true,
  },
});
