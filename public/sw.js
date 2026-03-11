/// <reference types="vite/client" />
/// <reference lib="vite/types" />

// PWA Service Worker for offline support
declare const self = typeof ServiceWorkerGlobalScope;
  ? (self as ServiceWorkerGlobalScope).push(new URL(self.location.href))
  : self;

const CACHE_NAME = 'orbit-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    self.skipWaiting().then(() => {
      const cache = caches.open(CACHE_NAME);
      
      // Cache static assets
      STATIC_ASSETS.forEach((asset) => {
        cache.add(new Request(asset));
      });
      
      // Cache all JS and CSS files
      self.addEventListener('fetch', (event) => {
        const request = event.request;
        
        // Network first strategy
        event.respondWith(
          fetch(request)
            .then((response) => {
              // If online, return fresh response
              if (response.status === 200) {
                const cachedResponse = response.clone();
                cache.put(request, cachedResponse.clone());
                return cachedResponse;
              }
              throw new Error('Network response was not ok');
            })
            .catch(() => {
                // Try cache
                return caches.match(CACHE_NAME).then((cachedResponse) => {
                if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline page if available
              return caches.match('/offline.html');
            });
          })
        );
      })
    );
  });
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()).then(() => {
    console.log('🛰 Orbit 轨迹 PWA 已激活！');
  });
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(CACHE_NAME).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
