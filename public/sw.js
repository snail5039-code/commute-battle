const CACHE_VERSION = 'commute-battle-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('commute-battle-') && ![STATIC_CACHE, PAGE_CACHE].includes(key)).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const payload = event.data.payload || {};
    const options = payload.options || {};
    event.waitUntil(self.registration.showNotification(payload.title || '출퇴근 생존일지', {
      body: options.body,
      icon: options.icon || '/icons/app-icon.svg',
      badge: options.badge || '/icons/app-icon.svg',
      tag: options.tag,
      data: options.data,
    }));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});

function isSafeRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return false;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isSafeRequest(request, url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((response) => response || Response.error())));
    return;
  }
  if (!['style', 'script', 'image', 'font'].includes(request.destination)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === 'basic' && !response.headers.has('set-cookie')) {
      const copy = response.clone();
      void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
