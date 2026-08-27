import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildIcebramArgs,
  buildIcebramGenerateArgs,
  buildIcepllArgs,
  hexPairMismatch,
  inspectHexFile,
  parseIcepllOutput,
  validatePllRequest,
  type PllRequest,
} from './icetools.ts'

const REQ: PllRequest = {
  inputMhz: 12,
  outputMhz: 25,
  moduleName: 'pll_25',
  fileName: 'pll.v',
  usePad: false,
  simpleFeedback: true,
}

/** Salida real de icepll 0.11 (yowasp) para -i 12 -o 25. */
const REAL_OUTPUT = [
  '',
  'F_PLLIN:    12.000 MHz (given)',
  'F_PLLOUT:   25.000 MHz (requested)',
  'F_PLLOUT:   25.125 MHz (achieved)',
  '',
  'FEEDBACK: SIMPLE',
  'F_PFD:   12.000 MHz',
  'F_VCO:  804.000 MHz',
  '',
  "DIVR:  0 (4'b0000)",
  "DIVF: 66 (7'b1000010)",
  "DIVQ:  5 (3'b101)",
  '',
  "FILTER_RANGE: 1 (3'b001)",
  '',
  'PLL configuration written to: pll.v',
].join('\n')

describe('icepll', () => {
  it('builds the argv icepll expects', () => {
    assert.deepEqual(buildIcepllArgs(REQ), [
      '-i', '12', '-o', '25', '-m', '-f', 'pll.v', '-n', 'pll_25',
    ])
  })

  it('adds -p for the PAD primitive and -S when feedback is not simple', () => {
    const args = buildIcepllArgs({ ...REQ, usePad: true, simpleFeedback: false })
    assert.ok(args.includes('-p'))
    assert.ok(args.includes('-S'))
  })

  it('reads the achieved frequency and the dividers', () => {
    const summary = parseIcepllOutput(REAL_OUTPUT)
    assert.equal(summary.achievedMhz, 25.125)
    assert.equal(summary.divr, 0)
    assert.equal(summary.divf, 66)
    assert.equal(summary.divq, 5)
    assert.equal(summary.filterRange, 1)
    assert.equal(summary.feedback, 'SIMPLE')
    assert.equal(summary.vcoMhz, 804)
  })

  it('survives output it does not understand', () => {
    const summary = parseIcepllOutput('nada que ver')
    assert.equal(summary.achievedMhz, null)
    assert.equal(summary.divf, null)
  })

  it('validates the request before burning a run', () => {
    assert.equal(validatePllRequest(REQ), null)
    assert.equal(validatePllRequest({ ...REQ, inputMhz: 5 }), 'PLL_BAD_INPUT')
    assert.equal(validatePllRequest({ ...REQ, outputMhz: 400 }), 'PLL_BAD_OUTPUT')
    assert.equal(validatePllRequest({ ...REQ, moduleName: '2pll' }), 'PLL_BAD_NAME')
    assert.equal(validatePllRequest({ ...REQ, fileName: 'pll.txt' }), 'PLL_BAD_FILE')
  })
})

describe('icebram', () => {
  const hex256 = (word: string) => `${word}\n`.repeat(256)

  it('accepts a well formed hex file', () => {
    const out = inspectHexFile(hex256('dead'))
    assert.deepEqual(out, { info: { words: 256, widthBits: 16 } })
  })

  it('rejects the shapes icebram refuses', () => {
    assert.deepEqual(inspectHexFile(''), { error: 'HEX_EMPTY' })
    assert.deepEqual(inspectHexFile(hex256('zzzz')), { error: 'HEX_BAD_CHAR' })
    assert.deepEqual(inspectHexFile(`dead\nbe\n`.repeat(128)), { error: 'HEX_RAGGED' })
    assert.deepEqual(inspectHexFile('dead\nbeef\n'), { error: 'HEX_NOT_256' })
  })

  it('compares the two files before running', () => {
    const a = { words: 256, widthBits: 16 }
    assert.equal(hexPairMismatch(a, { words: 256, widthBits: 16 }), null)
    assert.equal(hexPairMismatch(a, { words: 256, widthBits: 8 }), 'HEX_WIDTH')
    assert.equal(hexPairMismatch(a, { words: 512, widthBits: 16 }), 'HEX_DEPTH')
  })

  it('builds both argv shapes', () => {
    assert.deepEqual(buildIcebramArgs('rom.hex', 'rom2.hex'), ['rom.hex', 'rom2.hex'])
    assert.deepEqual(buildIcebramGenerateArgs(16, 256), ['-g', '16', '256'])
  })
})
