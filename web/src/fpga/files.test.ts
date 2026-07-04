import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addFpgaFile,
  closeFpgaTab,
  deleteFpgaFile,
  isFpgaFilename,
  nextFpgaFilename,
  openFpgaTab,
  uniquifyFpgaName,
  visibleFpgaTabs,
  zipPathToVerilogName,
  binDownloadName,
  normalizeFpgaFilename,
  renameFpgaFile,
} from './files.ts'

test('accepts identifier.v names', () => {
  assert.equal(isFpgaFilename('azukar_lab.v'), true)
  assert.equal(isFpgaFilename('and2.v'), true)
  assert.equal(isFpgaFilename('foo.sv'), false)
  assert.equal(isFpgaFilename('../x.v'), false)
})

test('next filename skips taken names', () => {
  assert.equal(nextFpgaFilename(['azukar_lab.v']), 'mod.v')
  assert.equal(nextFpgaFilename(['mod.v']), 'mod2.v')
})

test('closing a tab hides it but keeps the file', () => {
  const files = [
    { name: 'a.v', content: 'a', open: true },
    { name: 'b.v', content: 'b', open: true },
  ]
  const next = closeFpgaTab(files, 'a.v')
  assert.equal(next.length, 2)
  assert.equal(next[0]?.open, false)
  assert.deepEqual(
    visibleFpgaTabs(next).map((f) => f.name),
    ['b.v'],
  )
})

test('deleting a file removes it; the last file stays', () => {
  const files = [
    { name: 'a.v', content: 'a', open: true },
    { name: 'b.v', content: 'b', open: false },
  ]
  const gone = deleteFpgaFile(files, 'b.v')
  assert.deepEqual(
    gone.map((f) => f.name),
    ['a.v'],
  )
  assert.equal(deleteFpgaFile(gone, 'a.v').length, 1)
})

test('opening a closed file shows the tab again', () => {
  const files = [{ name: 'a.v', content: 'a', open: false }]
  assert.equal(openFpgaTab(files, 'a.v')[0]?.open, true)
})

test('addFpgaFile appends an open tab', () => {
  const next = addFpgaFile([{ name: 'azukar_lab.v', content: '', open: true }])
  assert.equal(next.length, 2)
  assert.equal(next[1]?.name, 'mod.v')
  assert.equal(next[1]?.open, true)
})

test('addFpgaFile is not capped at 10 tabs', () => {
  let files = [{ name: 'azukar_lab.v', content: '', open: true }]
  for (let i = 0; i < 10; i += 1) files = addFpgaFile(files)
  assert.equal(files.length, 11)
})

test('zip path uses basename and skips junk', () => {
  assert.equal(zipPathToVerilogName('src/and2.v'), 'and2.v')
  assert.equal(zipPathToVerilogName('__MACOSX/._and2.v'), null)
  assert.equal(zipPathToVerilogName('readme.md'), null)
})

test('uniquifyFpgaName suffixes collisions', () => {
  const taken = new Set(['and2.v'])
  assert.equal(uniquifyFpgaName('and2.v', taken), 'and2_2.v')
})

test('normalizeFpgaFilename adds .v and rejects junk', () => {
  assert.equal(normalizeFpgaFilename('top_module'), 'top_module.v')
  assert.equal(normalizeFpgaFilename('top_module.v'), 'top_module.v')
  assert.equal(normalizeFpgaFilename('  foo  '), 'foo.v')
  assert.equal(normalizeFpgaFilename('1bad'), null)
  assert.equal(normalizeFpgaFilename('../x'), null)
})

test('renameFpgaFile changes the name when free and valid', () => {
  const files = [
    { name: 'mod.v', content: 'a', open: true },
    { name: 'uart_tx.v', content: 'b', open: true },
  ]
  const next = renameFpgaFile(files, 'mod.v', 'gates')
  assert.deepEqual(
    next.map((f) => f.name),
    ['gates.v', 'uart_tx.v'],
  )
  assert.equal(renameFpgaFile(files, 'mod.v', 'uart_tx')[0]?.name, 'mod.v')
})

test('binDownloadName follows the top module', () => {
  assert.equal(binDownloadName('top_module'), 'top_module.bin')
  assert.equal(binDownloadName(' blinky '), 'blinky.bin')
  assert.equal(binDownloadName('not a name'), 'top_module.bin')
})
