import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  clearProject,
  createProject,
  deleteProjectById,
  loadCurrentProjectId,
  loadProject,
  loadProjectById,
  loadProjectIndex,
  MAX_PROJECT_CHARS,
  migrateLegacyProject,
  parseProject,
  PROJECT_KEY,
  renameProject,
  saveCurrentProjectId,
  saveProject,
  saveProjectById,
  touchProject,
  uniqueProjectName,
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
  const meta = createProject('Contador')
  saveCurrentProjectId(meta.id)
  assert.equal(saveProject(project), true)
  assert.equal(data.has(`lattice.project.${meta.id}`), true)
  assert.deepEqual(loadProject(), project)
  clearProject()
  assert.equal(loadProject(), null)
  // Vaciar el contenido no lo saca del índice.
  assert.equal(loadProjectIndex().length, 1)
})

test('a project bigger than the cap is not stored', () => {
  installMemoryStorage()
  const meta = createProject()
  saveCurrentProjectId(meta.id)
  const huge = {
    ...project,
    files: [{ name: 'top.v', content: 'x'.repeat(MAX_PROJECT_CHARS + 1), open: true }],
  }
  assert.equal(saveProject(huge), false)
  assert.equal(loadProject(), null)
})

test('several projects live side by side', () => {
  installMemoryStorage()
  const a = createProject('Contador')
  const b = createProject('VGA')
  saveProjectById(a.id, project)
  saveProjectById(b.id, { ...project, top: 'vga' })
  assert.equal(loadProjectById(a.id)?.top, 'top_module')
  assert.equal(loadProjectById(b.id)?.top, 'vga')
  assert.deepEqual(
    loadProjectIndex().map((p) => p.name),
    ['Contador', 'VGA'],
  )
})

test('ids do not repeat after deleting one', () => {
  installMemoryStorage()
  const a = createProject('uno')
  createProject('dos')
  deleteProjectById(a.id)
  const c = createProject('tres')
  assert.notEqual(c.id, a.id)
  assert.equal(loadProjectIndex().length, 2)
})

test('deleting the open project moves the pointer', () => {
  installMemoryStorage()
  const a = createProject('uno')
  const b = createProject('dos')
  saveCurrentProjectId(b.id)
  saveProjectById(b.id, project)
  deleteProjectById(b.id)
  assert.equal(loadProjectById(b.id), null)
  assert.equal(loadCurrentProjectId(), a.id)
})

test('deleting the last project leaves no pointer', () => {
  installMemoryStorage()
  const a = createProject('solo')
  saveCurrentProjectId(a.id)
  deleteProjectById(a.id)
  assert.equal(loadCurrentProjectId(), null)
  assert.deepEqual(loadProjectIndex(), [])
})

test('names do not collide', () => {
  installMemoryStorage()
  createProject('Contador')
  const second = createProject('Contador')
  assert.equal(second.name, 'Contador 2')
  assert.equal(uniqueProjectName('Contador', ['Contador', 'Contador 2']), 'Contador 3')
})

test('renaming keeps the name unique and the id stable', () => {
  installMemoryStorage()
  const a = createProject('uno')
  const b = createProject('dos')
  const list = renameProject(b.id, 'uno')
  assert.equal(list.find((p) => p.id === b.id)?.name, 'uno 2')
  assert.equal(list.find((p) => p.id === a.id)?.name, 'uno')
})

test('touch updates the timestamp of one project only', () => {
  installMemoryStorage()
  const a = createProject('uno')
  const b = createProject('dos')
  const list = touchProject(b.id, 1234)
  assert.equal(list.find((p) => p.id === a.id)?.updatedAt, 0)
  assert.equal(list.find((p) => p.id === b.id)?.updatedAt, 1234)
})

test('the old single-project key is migrated once', () => {
  const data = installMemoryStorage()
  data.set(`lattice.${PROJECT_KEY}`, JSON.stringify(project))
  const meta = migrateLegacyProject('Mi proyecto')
  assert.equal(meta?.name, 'Mi proyecto')
  assert.equal(data.has(`lattice.${PROJECT_KEY}`), false)
  assert.equal(loadCurrentProjectId(), meta?.id)
  assert.deepEqual(loadProject(), project)
  assert.equal(migrateLegacyProject(), null)
})

test('a corrupt old key is dropped without creating a project', () => {
  const data = installMemoryStorage()
  data.set(`lattice.${PROJECT_KEY}`, '{not json')
  assert.equal(migrateLegacyProject(), null)
  assert.deepEqual(loadProjectIndex(), [])
})

test('a junk index does not break the app', () => {
  const data = installMemoryStorage()
  data.set('lattice.projects', '{"nope":1}')
  assert.deepEqual(loadProjectIndex(), [])
  data.set('lattice.projects', '[{"id":"../evil","name":"x"},{"id":"p1","name":"ok"}]')
  assert.deepEqual(loadProjectIndex(), [{ id: 'p1', name: 'ok', updatedAt: 0 }])
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
