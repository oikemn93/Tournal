const CACHE_NAME = 'tournal-shell-v4';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon-16.png', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Tournal', body: event.data ? event.data.text() : 'Nouvelle notification' };
  }

  const title = payload.title || 'Tournal';
  const options = {
    body: payload.body || 'Nouvelle notification',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || `tournal-${Date.now()}`,
    data: payload.data || { url: '/' },
    renotify: false,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Important on iOS/iPadOS: do not navigate an already-open PWA window.
    // Navigating first can recreate/reload the standalone context and lose the
    // tab-scoped authenticated state. Focus the existing Tournal client instead.
    for (const client of windows) {
      try {
        client.postMessage({ type: 'TOURNAL_NOTIFICATION_CLICK', url: target });
      } catch {}
      if ('focus' in client) return client.focus();
    }

    // If iOS has fully terminated the PWA there is no live authenticated window
    // to reuse. Opening a new window is then the only standards-based option.
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  })());
});
