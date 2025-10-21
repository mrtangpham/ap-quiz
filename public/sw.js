// AP-Quiz Service Worker (cache đơn giản app shell)
// Chiến lược: network-first cho HTML, cache-first cho asset tĩnh
const CACHE_NAME = 'apquiz-cache-v1';
const APP_SHELL = [
  '/', '/index.html',
  '/logo-placeholder.svg',
  // Vite sẽ sinh ra các file /assets/... sau khi build. 
  // SW runtime sẽ tự cache khi người dùng truy cập.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Helper: phân loại request
function isHtmlRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}
function isSameOriginAsset(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return self.location.origin === url.origin && (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));
  } catch { return false; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Bỏ qua non-GET, Supabase realtime/websocket, v.v.
  if (req.method !== 'GET') return;
  if (req.url.startsWith('wss://') || req.url.startsWith('ws://')) return;

  // HTML -> network-first (fallback cache)
  if (isHtmlRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Asset tĩnh same-origin -> cache-first
  if (isSameOriginAsset(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return resp;
        });
      })
    );
    return;
  }

  // Mặc định: network (không can thiệp API Supabase)
});
