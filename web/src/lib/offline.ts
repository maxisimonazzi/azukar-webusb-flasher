/**
 * Registro del service worker y lo poco que la UI necesita saber de él.
 * Solo en producción: con `vite dev` un SW cacheando módulos es un dolor.
 */

import { ref } from 'vue'

export type OfflineStatus = 'unsupported' | 'off' | 'registering' | 'ready' | 'failed'

export const offlineStatusRef = ref<OfflineStatus>('off')
/** Bytes que el navegador dice tener guardados para este origen. */
export const offlineBytesRef = ref<number | null>(null)

function swUrl(): string {
  return `${import.meta.env.BASE_URL}sw.js`
}

export function initOffline(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    offlineStatusRef.value = 'unsupported'
    return
  }
  if (!import.meta.env.PROD) {
    offlineStatusRef.value = 'off'
    return
  }
  offlineStatusRef.value = 'registering'
  navigator.serviceWorker
    .register(swUrl(), { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
    .then(() => {
      offlineStatusRef.value = 'ready'
      void refreshOfflineBytes()
    })
    .catch(() => {
      offlineStatusRef.value = 'failed'
    })
}

export async function refreshOfflineBytes(): Promise<void> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    offlineBytesRef.value = typeof estimate?.usage === 'number' ? estimate.usage : null
  } catch {
    offlineBytesRef.value = null
  }
}

/** Tira la caché y vuelve a bajar todo en la próxima carga. */
export async function clearOfflineCache(): Promise<void> {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' })
  try {
    const names = await caches.keys()
    await Promise.all(
      names.filter((name) => name.startsWith('lattice-')).map((name) => caches.delete(name)),
    )
  } catch {
    /* sin Cache Storage no hay nada que limpiar */
  }
  await refreshOfflineBytes()
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return '—'
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}
