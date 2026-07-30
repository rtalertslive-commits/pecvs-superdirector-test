const CACHE_NAME = 'pecvs-superdirector-v0.10.0';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(c => c.postMessage({ type: 'sw-activated', version: CACHE_NAME }));
    })());
});

// Timeout de red para la navegación. Sin esto, un fetch colgado (señal mala,
// torre saturada, captive portal) deja al SW sin responder — y el splash nativo
// del PWA se queda en pantalla hasta que el browser aborta solo (30-120s).
// Con 4s servimos cache y la app abre al instante; la próxima carga trae fresh.
const NAV_TIMEOUT_MS = 4000;
const LAST_RESORT_MS = 15000;

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // Network-First CON TIMEOUT para la navegación principal (index.html).
    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            const cached = (await caches.match(event.request))
                || (await caches.match('./index.html'))
                || (await caches.match('./'));

            try {
                const res = await Promise.race([
                    fetch(event.request, { cache: 'no-store' }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('sw-nav-timeout')), NAV_TIMEOUT_MS))
                ]);
                if (res && res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
                }
                return res;
            } catch (err) {
                if (cached) return cached;
                return await Promise.race([
                    fetch(event.request),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('sw-last-resort-timeout')), LAST_RESORT_MS))
                ]);
            }
        })());
    } else {
        event.respondWith(
            caches.match(event.request).then(res => res || fetch(event.request))
        );
    }
});
