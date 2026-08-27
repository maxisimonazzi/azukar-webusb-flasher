import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildShareUrl,
  decodeShareProject,
  encodeShareProject,
  readShareCode,
  type ShareProject,
} from './shareLink.ts'

const PROJECT: ShareProject = {
  top: 'top_module',
  boardId: 'azukar-v2',
  files: [
    { name: 'top_module.v', content: 'module top_module(input clk);\nendmodule\n' },
    { name: 'pins.pcf', content: 'set_io clk 49\n' },
  ],
}

describe('shareLink', () => {
  it('round-trips a project through the code', async () => {
    const code = await encodeShareProject(PROJECT)
    const back = await decodeShareProject(code)
    assert.deepEqual(back, PROJECT)
  })

  it('compresses: repeated text does not grow the link linearly', async () => {
    const big: ShareProject = {
      ...PROJECT,
      files: [{ name: 'top_module.v', content: 'assign led = 1;\n'.repeat(400) }],
    }
    const code = await encodeShareProject(big)
    assert.ok(code.length < 800, `link demasiado largo: ${code.length}`)
    const back = await decodeShareProject(code)
    assert.equal(back?.files[0]?.content.length, 'assign led = 1;\n'.length * 400)
  })

  it('uses url-safe characters only', async () => {
    const code = await encodeShareProject(PROJECT)
    assert.match(code, /^[0-9A-Za-z_-]+$/)
  })

  it('rejects garbage instead of throwing', async () => {
    assert.equal(await decodeShareProject(''), null)
    assert.equal(await decodeShareProject('1'), null)
    assert.equal(await decodeShareProject('1@@@@'), null)
    assert.equal(await decodeShareProject('9abc'), null)
  })

  it('rejects a payload with too many files', async () => {
    const many: ShareProject = {
      ...PROJECT,
      files: Array.from({ length: 200 }, (_, i) => ({ name: `m${i}.v`, content: 'x' })),
    }
    assert.equal(await decodeShareProject(await encodeShareProject(many)), null)
  })

  it('puts the code in the fragment, never in the query', () => {
    const url = buildShareUrl('https://host/app/?x=1#viejo', 'ABC')
    assert.equal(url, 'https://host/app/?x=1#p=ABC')
  })

  it('reads the code back from the hash', () => {
    assert.equal(readShareCode('#p=ABC'), 'ABC')
    assert.equal(readShareCode('#a=1&p=XYZ'), 'XYZ')
    assert.equal(readShareCode('#nada'), null)
    assert.equal(readShareCode(''), null)
  })
})
