/*
 * Service worker de la app. No hay build step acá: es JS plano que nginx sirve
 * al lado del index.html.
 *
 * Qué resuelve: los WASM de YoWASP (Yosys y nextpnr) son decenas de MB. Sin
 * caché, cada máquina del aula los baja de nuevo cada vez que se limpia el
 * navegador, y sin internet no hay síntesis. Con esto, la segunda carga es
 * instantánea y la app compila sin conexión.
 *
 * Estrategia:
 *   - navegación (index.html): red primero, caché si no hay internet.
 *   - /yowasp/ y .wasm/.tar: caché primero (son inmutables, tienen versión
 *     en el nombre del paquete).
 *   - /assets/ y /fonts/ (hash de Vite en el nombre): caché primero.
 *   - el resto: se sirve de caché y se refresca de fondo.
 */

const VERSION = 'v1'
const SHELL_CACHE = `lattice-shell-${VERSION}`
const HEAVY_CACHE = `lattice-wasm-${VERSION}`
const KEEP = [SHELL_CACHE, HEAVY_CACHE]

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name.startsWith('lattice-') && !KEEP.includes(name)).map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

function isHeavy(url) {
  return (
    url.pathname.includes('/yowasp/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.tar')
  )
}

function isImmutableAsset(url) {
  return url.pathname.includes('/assets/') || url.pathname.includes('/fonts/')
}

function cacheable(response) {
  return response && response.status === 200 && response.type !== 'opaque'
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (cacheable(response)) cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (cacheable(response)) cache.put(request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(request)
    if (hit) return hit
    const index = await cache.match(new URL('./', self.registration.scope).href)
    if (index) return index
    throw err
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE)
  const hit = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (cacheable(response)) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  if (hit) return hit
  const response = await network
  if (response) return response
  throw new Error('offline')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  if (isHeavy(url)) {
    event.respondWith(cacheFirst(request, HEAVY_CACHE))
    return
  }
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }
  event.respondWith(staleWhileRevalidate(request))
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys()
        await Promise.all(
          names.filter((name) => name.startsWith('lattice-')).map((name) => caches.delete(name)),
        )
      })(),
    )
  }
})
