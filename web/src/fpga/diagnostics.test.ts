import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { countBySeverity, parseToolLog, sortDiagnostics } from './diagnostics.ts'

const FILES = ['top_module.v', 'uart_tx.v', 'pins.pcf']

describe('parseToolLog', () => {
  it('takes file and line from a Yosys error', () => {
    const [d] = parseToolLog(
      ['======== Yosys (synth_ice40) ========', "top_module.v:12: ERROR: syntax error, unexpected ','"],
      { files: FILES },
    )
    assert.equal(d?.file, 'top_module.v')
    assert.equal(d?.line, 12)
    assert.equal(d?.severity, 'error')
    assert.equal(d?.source, 'yosys')
    assert.match(d?.message ?? '', /syntax error/)
  })

  it('reads Yosys warnings with file and line', () => {
    const [d] = parseToolLog(['uart_tx.v:8: Warning: Wire \foo is used but has no driver.'], {
      files: FILES,
    })
    assert.equal(d?.severity, 'warning')
    assert.equal(d?.file, 'uart_tx.v')
    assert.equal(d?.line, 8)
  })

  it('keeps errors without a location', () => {
    const [d] = parseToolLog(
      ['ERROR: Module uart_tx referenced in module top_module is not part of the design.'],
      { files: FILES },
    )
    assert.equal(d?.file, null)
    assert.equal(d?.line, null)
    assert.equal(d?.severity, 'error')
  })

  it('points "(on line N)" from nextpnr at the pcf', () => {
    const [d] = parseToolLog(
      ['======== nextpnr-ice40 ========', "ERROR: unmatched constraint 'LED9' (on line 14)"],
      { files: FILES, pcfName: 'pins.pcf' },
    )
    assert.equal(d?.file, 'pins.pcf')
    assert.equal(d?.line, 14)
    assert.equal(d?.source, 'pcf')
  })

  it('finds a filename inside the message text', () => {
    const [d] = parseToolLog(['ERROR: Parser error in top_module.v:33: unexpected end'], {
      files: FILES,
    })
    assert.equal(d?.file, 'top_module.v')
    assert.equal(d?.line, 33)
  })

  it('does not link files outside the project', () => {
    const [d] = parseToolLog(['/tmp/whatever.v:3: ERROR: nope'], { files: FILES })
    assert.equal(d?.file, null)
    assert.equal(d?.line, 3)
  })

  it('ignores plain log lines', () => {
    const diags = parseToolLog(
      ['2.7. Executing SYNTH_ICE40 pass.', 'Info: Device utilisation:', ''],
      { files: FILES },
    )
    assert.equal(diags.length, 0)
  })

  it('deduplicates repeated messages', () => {
    const diags = parseToolLog(
      ['top_module.v:5: ERROR: boom', 'top_module.v:5: ERROR: boom'],
      { files: FILES },
    )
    assert.equal(diags.length, 1)
  })

  it('respects the cap', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `top_module.v:${i + 1}: Warning: w${i}`)
    assert.equal(parseToolLog(lines, { files: FILES, max: 10 }).length, 10)
  })

  it('counts and sorts errors first', () => {
    const diags = parseToolLog(
      ['top_module.v:9: Warning: w', 'top_module.v:2: ERROR: e'],
      { files: FILES },
    )
    assert.deepEqual(countBySeverity(diags), { errors: 1, warnings: 1 })
    assert.equal(sortDiagnostics(diags)[0]?.severity, 'error')
  })
})
