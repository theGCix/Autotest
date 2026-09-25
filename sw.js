/*
 * Service Worker — dos cachés separados:
 *
 *  - CACHE_SHELL: el código de la app (HTML/CSS/JS/config). Se reemplaza
 *    completo cada vez que subes CACHE_SHELL_VERSION.
 *  - CACHE_DOCS: los 210 PDF. NO se borra cuando actualizas el código —
 *    así no hay que volver a descargar 113 MB cada vez que corriges un
 *    detalle de la app. Solo se vuelve a llenar si falta un archivo.
 *
 * Súbele el número a CACHE_SHELL_VERSION cuando cambies app.js, sync.js,
 * styles.css, index.html o app-config.js y quieras que las tablets tomen
 * la versión nueva. Solo súbele el número a CACHE_DOCS_VERSION si de
 * verdad quieres forzar una re-descarga completa de todos los PDF.
 */
const CACHE_SHELL_VERSION = 'v2';
const CACHE_DOCS_VERSION = 'v1';
const CACHE_SHELL = 'tops-shell-' + CACHE_SHELL_VERSION;
const CACHE_DOCS = 'tops-docs-' + CACHE_DOCS_VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './src/app.js',
  './src/sync.js',
  './src/styles.css',
  './src/v19-overrides.js',
  './src/v20-compat.js',
  './data/app-config.js',
  './data/sync-config.js',
  './data/docs-manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names
        .filter(n => n.startsWith('tops-shell-') && n !== CACHE_SHELL) // los docs NO se tocan aquí
        .map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('.supabase.co')) return;

  const isDoc = req.url.includes('/docs/') && req.url.toLowerCase().endsWith('.pdf');
  const cacheName = isDoc ? CACHE_DOCS : CACHE_SHELL;

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(cacheName).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ---------------------------------------------------------------
// Descarga completa de los PDF a pedido (botón "Descargar PDFs")
// o automáticamente poco después de instalarse, para que el kiosco
// quede listo para trabajar sin conexión sin que nadie tenga que
// acordarse de tocar nada.
// ---------------------------------------------------------------

async function cacheAllDocs(notify) {
  const manifestRes = await fetch('./data/docs-manifest.json');
  const files = await manifestRes.json();
  const cache = await caches.open(CACHE_DOCS);
  let done = 0, failed = 0;

  for (const path of files) {
    const existing = await cache.match(path);
    if (!existing) {
      try {
        const res = await fetch(path);
        if (res.ok) await cache.put(path, res);
        else failed++;
      } catch (e) {
        failed++;
      }
    }
    done++;
    if (notify) notify({ type: 'DOCS_CACHE_PROGRESS', done, total: files.length, failed });
  }
  if (notify) notify({ type: 'DOCS_CACHE_DONE', done, total: files.length, failed });
}

function broadcast(msg) {
  self.clients.matchAll().then(list => list.forEach(c => c.postMessage(msg)));
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_DOCS_NOW') {
    cacheAllDocs(broadcast);
  }
});

// Intento automático en segundo plano, sin bloquear nada, poco después
// de que este Service Worker tome control por primera vez.
self.addEventListener('activate', () => {
  setTimeout(() => cacheAllDocs(broadcast), 4000);
});
