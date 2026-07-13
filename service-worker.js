// Service Worker — Fotos Doca (funciona offline)
const CACHE = 'fotos-doca-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegação: tenta rede, cai para o index em cache (offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const cl = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cl)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // App shell + CDN: cache primeiro (carrega instantâneo e offline)
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(r =>
        r || fetch(req).then(res => {
          if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
          return res;
        })
      )
    );
    return;
  }

  // Supabase (lista e imagens das fotos): rede primeiro, cache como reserva offline
  if (url.hostname.endsWith('.supabase.co')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
