import assert from 'node:assert/strict'
import { test } from 'node:test'

import { liveStorageKey } from '../lib/storage.ts'

import { isAppPalette, readStoredPalette, resolvePalette } from './palette.ts'
import { PALETTE_KEY } from './types.ts'

function installMemoryStorage() {
  const data = new Map<string, string>()
  const store = {
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null
    },
    setItem(key: string, value: string) {
      data.set(key, String(value))
    },
    removeItem(key: string) {
      data.delete(key)
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
  })
  return data
}

test('isAppPalette accepts the eight named palettes', () => {
  assert.equal(isAppPalette('amber'), true)
  assert.equal(isAppPalette('cyan'), true)
  assert.equal(isAppPalette('sky'), true)
  assert.equal(isAppPalette('red'), true)
  assert.equal(isAppPalette('violet'), true)
  assert.equal(isAppPalette('orange'), true)
  assert.equal(isAppPalette('green'), true)
  assert.equal(isAppPalette('yellow'), true)
  assert.equal(isAppPalette('navy'), false)
  assert.equal(isAppPalette(null), false)
})

test('resolvePalette falls back to amber when storage is empty or junk', () => {
  const data = installMemoryStorage()
  assert.equal(resolvePalette(), 'amber')
  data.set(liveStorageKey(PALETTE_KEY), 'navy')
  assert.equal(readStoredPalette(), null)
  assert.equal(resolvePalette(), 'amber')
})

test('readStoredPalette returns a saved palette', () => {
  const data = installMemoryStorage()
  data.set(liveStorageKey(PALETTE_KEY), 'violet')
  assert.equal(readStoredPalette(), 'violet')
  assert.equal(resolvePalette(), 'violet')
})
