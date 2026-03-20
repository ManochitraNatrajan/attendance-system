self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => new Response('Offline. Connect to the internet to use Sri Krishna Dairy.')));
});
