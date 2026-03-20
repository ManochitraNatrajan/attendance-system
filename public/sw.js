self.addEventListener('install', (e) => {
  self.skipWaiting();
  console.log('[Service Worker] Installed');
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
  console.log('[Service Worker] Activated');
});

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => new Response('Offline. Connect to the internet to use Sri Krishna Dairy.')));
});
