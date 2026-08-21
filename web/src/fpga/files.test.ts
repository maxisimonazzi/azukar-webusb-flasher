import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addFpgaFile,
  closeFpgaTab,
  deleteFpgaFile,
  getAllowedImportExtensions,
  isAllowedFilename,
  isFpgaFilename,
  nextFpgaFilename,
  openFpgaTab,
  projectZipDownloadName,
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

test('getAllowedImportExtensions returns defaults when env is unset', () => {
  const exts = getAllowedImportExtensions()
  assert.deepEqual(exts, ['v', 'pcf', 'txt'])
})

test('isAllowedFilename validates extension and safe stem', () => {
  assert.equal(isAllowedFilename('pins.pcf'), true)
  assert.equal(isAllowedFilename('memory.txt'), true)
  assert.equal(isAllowedFilename('top_module.v'), true)
  assert.equal(isAllowedFilename('bad..name.txt'), false)
  assert.equal(isAllowedFilename('../hack.txt'), false)
  assert.equal(isAllowedFilename('script.py'), false)
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
  assert.equal(zipPathToVerilogName('src/pins.pcf'), 'pins.pcf')
  assert.equal(zipPathToVerilogName('data/rom.txt'), 'rom.txt')
  assert.equal(zipPathToVerilogName('__MACOSX/._and2.v'), null)
  assert.equal(zipPathToVerilogName('readme.md'), null)
})

test('uniquifyFpgaName suffixes collisions preserving extension', () => {
  const taken = new Set(['and2.v', 'pins.pcf'])
  assert.equal(uniquifyFpgaName('and2.v', taken), 'and2_2.v')
  assert.equal(uniquifyFpgaName('pins.pcf', taken), 'pins_2.pcf')
})

test('normalizeFpgaFilename adds .v when missing and keeps allowed extensions', () => {
  assert.equal(normalizeFpgaFilename('top_module'), 'top_module.v')
  assert.equal(normalizeFpgaFilename('top_module.v'), 'top_module.v')
  assert.equal(normalizeFpgaFilename('pins.pcf'), 'pins.pcf')
  assert.equal(normalizeFpgaFilename('rom.txt'), 'rom.txt')
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
  assert.equal(renameFpgaFile(files, 'mod.v', 'counter.v')[0]?.name, 'counter.v')
  assert.equal(renameFpgaFile(files, 'mod.v', 'data.txt')[0]?.name, 'data.txt')
  assert.equal(renameFpgaFile(files, 'mod.v', 'pins.pcf')[0]?.name, 'pins.pcf')
})

test('binDownloadName follows the top module', () => {
  assert.equal(binDownloadName('top_module'), 'top_module.bin')
  assert.equal(binDownloadName(' blinky '), 'blinky.bin')
  assert.equal(binDownloadName('not a name'), 'top_module.bin')
})

test('projectZipDownloadName follows top module or input name', () => {
  assert.equal(projectZipDownloadName('top_module'), 'top_module.zip')
  assert.equal(projectZipDownloadName('blinky.v'), 'blinky.v.zip')
  assert.equal(projectZipDownloadName('blinky'), 'blinky.zip')
  assert.equal(projectZipDownloadName('my_project.zip'), 'my_project.zip')
  assert.equal(projectZipDownloadName('   '), 'top_module.zip')
})
