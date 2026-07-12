// Service worker do Fotos Doca.
// Guarda o app (index.html) em cache para ele abrir mesmo sem internet.
// Os dados (fotos) ficam por conta do IndexedDB + fila de sincronização
// dentro do próprio index.html — este arquivo só cuida de deixar a
// "casca" do site disponível offline.
const CACHE = 'fotos-doca-v4';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Navegação (abrir o site): tenta rede primeiro para pegar a versão mais
  // nova, mas cai para o cache (e depois para o index.html) se estiver offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Demais arquivos (ex.: biblioteca do Supabase via CDN): cache-first,
  // com atualização em segundo plano quando há rede.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request)
        .then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
