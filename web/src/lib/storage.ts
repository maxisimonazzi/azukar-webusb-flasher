/** Browser storage for this app. Live prefix is lattice.*; azukar.* is read once and copied. */

export const STORAGE_PREFIX = 'lattice'
export const STORAGE_LEGACY_PREFIX = 'azukar'

export function liveStorageKey(name: string): string {
  return `${STORAGE_PREFIX}.${name}`
}

export function legacyStorageKey(name: string): string {
  return `${STORAGE_LEGACY_PREFIX}.${name}`
}

function readRaw(store: Storage, name: string): string | null {
  const live = store.getItem(liveStorageKey(name))
  if (live != null) return live
  const old = store.getItem(legacyStorageKey(name))
  if (old == null) return null
  store.setItem(liveStorageKey(name), old)
  store.removeItem(legacyStorageKey(name))
  return old
}

function writeRaw(store: Storage, name: string, value: string): void {
  store.setItem(liveStorageKey(name), value)
  store.removeItem(legacyStorageKey(name))
}

function removeRaw(store: Storage, name: string): void {
  store.removeItem(liveStorageKey(name))
  store.removeItem(legacyStorageKey(name))
}

export function readLocal(name: string): string | null {
  try {
    return readRaw(localStorage, name)
  } catch {
    return null
  }
}

export function writeLocal(name: string, value: string): void {
  try {
    writeRaw(localStorage, name, value)
  } catch {
    /* private mode */
  }
}

export function removeLocal(name: string): void {
  try {
    removeRaw(localStorage, name)
  } catch {
    /* private mode */
  }
}

export function readSession(name: string): string | null {
  try {
    return readRaw(sessionStorage, name)
  } catch {
    return null
  }
}

export function writeSession(name: string, value: string): void {
  try {
    writeRaw(sessionStorage, name, value)
  } catch {
    /* private mode */
  }
}
