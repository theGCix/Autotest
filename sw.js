/*
 * Service Worker — deja instalada la app (HTML/CSS/JS/config) en el
 * dispositivo la primera vez que carga con Internet, para que después
 * abra sin conexión. Los datos (usuarios, evaluaciones) siguen viviendo
 * en localStorage como siempre — esto solo cachea los archivos de la app.
 *
 * IMPORTANTE: sube de versión CACHE_NAME cada vez que cambies app.js,
 * sync.js, styles.css, index.html o app-config.js y quieras que las
 * tablets ya instaladas tomen la versión nueva.
 */
const CACHE_NAME = 'tops-shell-v1';

// Rutas relativas al lugar donde vive este sw.js (funciona igual si el
// sitio está en la raíz o en un subpath como /Autotest/).
const SHELL_FILES = [
  './',
  './index.html',
  './src/app.js',
  './src/sync.js',
  './src/styles.css',
  './src/v19-overrides.js',
  './src/v20-compat.js',
  './data/app-config.js',
  './data/sync-config.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Nunca intervenir en lo que no sea GET (los POST/PATCH de sincronización
  // a Supabase deben ir siempre directo a la red, nunca a la caché).
  if (req.method !== 'GET') return;

  // Nunca cachear llamadas a Supabase (auth/rest): esos datos deben ser
  // siempre en vivo, no una copia vieja.
  if (req.url.includes('.supabase.co')) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        // Guarda una copia fresca para la próxima vez que no haya conexión.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached); // sin Internet: usa lo que haya en caché

      // Muestra la caché de inmediato si existe (rápido y funciona offline);
      // igual actualiza en segundo plano para la próxima vez.
      return cached || network;
    })
  );
});
