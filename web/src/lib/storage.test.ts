import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  legacyStorageKey,
  liveStorageKey,
  readLocal,
  removeLocal,
  writeLocal,
} from './storage.ts'

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

test('readLocal copies azukar.* onto lattice.* and drops the old key', () => {
  const data = installMemoryStorage()
  data.set(legacyStorageKey('theme'), 'light')
  assert.equal(readLocal('theme'), 'light')
  assert.equal(data.get(liveStorageKey('theme')), 'light')
  assert.equal(data.has(legacyStorageKey('theme')), false)
})

test('readLocal prefers lattice.* when both prefixes exist', () => {
  const data = installMemoryStorage()
  data.set(liveStorageKey('locale'), 'en')
  data.set(legacyStorageKey('locale'), 'es')
  assert.equal(readLocal('locale'), 'en')
  assert.equal(data.get(legacyStorageKey('locale')), 'es')
})

test('writeLocal writes lattice.* and removes azukar.*', () => {
  const data = installMemoryStorage()
  data.set(legacyStorageKey('boardId'), 'azukar-v2')
  writeLocal('boardId', 'edu-ciaa-fpga')
  assert.equal(data.get(liveStorageKey('boardId')), 'edu-ciaa-fpga')
  assert.equal(data.has(legacyStorageKey('boardId')), false)
})

test('removeLocal clears both prefixes', () => {
  const data = installMemoryStorage()
  data.set(liveStorageKey('customBoard'), '{}')
  data.set(legacyStorageKey('customBoard'), '{}')
  removeLocal('customBoard')
  assert.equal(data.has(liveStorageKey('customBoard')), false)
  assert.equal(data.has(legacyStorageKey('customBoard')), false)
})
