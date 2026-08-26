import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  clearProject,
  loadProject,
  MAX_PROJECT_CHARS,
  parseProject,
  PROJECT_KEY,
  saveProject,
} from './projectStore.ts'

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

const project = {
  top: 'top_module',
  activeName: 'top_module.v',
  files: [
    { name: 'top_module.v', content: 'module top_module; endmodule', open: true },
    { name: 'pins.pcf', content: 'set_io LED0 37', open: true },
  ],
}

test('a saved project round-trips through localStorage', () => {
  const data = installMemoryStorage()
  assert.equal(saveProject(project), true)
  assert.equal(data.has(`lattice.${PROJECT_KEY}`), true)
  assert.deepEqual(loadProject(), project)
  clearProject()
  assert.equal(loadProject(), null)
})

test('a project bigger than the cap is not stored', () => {
  installMemoryStorage()
  const huge = {
    ...project,
    files: [{ name: 'top.v', content: 'x'.repeat(MAX_PROJECT_CHARS + 1), open: true }],
  }
  assert.equal(saveProject(huge), false)
  assert.equal(loadProject(), null)
})

test('parseProject rejects junk instead of half-loading it', () => {
  assert.equal(parseProject(null), null)
  assert.equal(parseProject({ files: [] }), null)
  assert.equal(parseProject({ files: [{ name: 'top.v' }] }), null)
  assert.equal(parseProject({ files: [{ name: '../etc/passwd', content: '', open: true }] }), null)
  assert.equal(
    parseProject({
      files: [
        { name: 'top.v', content: 'a', open: true },
        { name: 'top.v', content: 'b', open: true },
      ],
    }),
    null,
  )
})

test('parseProject falls back to the first open tab when activeName is stale', () => {
  const parsed = parseProject({
    top: 'top_module',
    activeName: 'gone.v',
    files: [
      { name: 'top.v', content: 'a', open: false },
      { name: 'uart_tx.v', content: 'b', open: true },
    ],
  })
  assert.equal(parsed?.activeName, 'uart_tx.v')
  assert.equal(parsed?.files[0]?.open, false)
})
