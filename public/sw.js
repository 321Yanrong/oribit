// Legacy cleanup worker:
// this file intentionally unregisters itself and clears old caches.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url))))
  );
});

// 允许客户端请求立即激活等待中的新版 SW
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING' && self.skipWaiting) {
    self.skipWaiting();
  }
});
