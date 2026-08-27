import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { explainMessage, findHint } from './hints.ts'

/**
 * Mensajes reales de Yosys 0.68 y nextpnr-ice40 0.11, copiados de una corrida
 * de la toolchain (no inventados).
 */
describe('findHint', () => {
  it('recognises an inferred latch and pulls the signal name', () => {
    const hint = findHint(
      "Latch inferred for signal `\\top.\\q' from process `\\top.$proc$top.v:2$381': $auto$proc_dlatch.cc:547",
    )
    assert.equal(hint?.key, 'latch')
    assert.equal(hint?.subject, 'q')
    assert.match(explainMessage('Latch inferred for signal `\\top.\\q\'') ?? '', /always @\(\*\)/)
  })

  it('does not fire on the "No latch inferred" line', () => {
    assert.equal(findHint("No latch inferred for signal `\\top.\\r' from process"), null)
  })

  it('explains the cryptic check -assert error', () => {
    const hint = findHint("ERROR: Found 1 problems in 'check -assert'.")
    assert.equal(hint?.key, 'latch-check')
    assert.match(explainMessage("Found 1 problems in 'check -assert'.") ?? '', /latch/)
  })

  it('recognises a wire with no driver', () => {
    const hint = findHint('Wire top.\\suelta is used but has no driver.')
    assert.equal(hint?.key, 'no-driver')
    assert.equal(hint?.subject, 'suelta')
  })

  it('recognises an implicitly declared identifier', () => {
    const hint = findHint("Identifier `\\no_declarada' is implicitly declared.")
    assert.equal(hint?.key, 'implicit')
    assert.equal(hint?.subject, 'no_declarada')
  })

  it('recognises a missing module', () => {
    const hint = findHint(
      "Module `\\falta' referenced in module `\\top' in cell `\\u0' is not part of the design.",
    )
    assert.equal(hint?.key, 'missing-module')
    assert.equal(hint?.subject, 'falta')
  })

  it('recognises an unconstrained IO from nextpnr', () => {
    const hint = findHint("IO 'LED7' is unconstrained in PCF (override this error with --pcf-allow-unconstrained)")
    assert.equal(hint?.key, 'unconstrained')
    assert.equal(hint?.subject, 'LED7')
  })

  it('recognises a clock constraint that nextpnr ignored', () => {
    const hint = findHint("net 'CLK100' does not exist in design, ignoring clock constraint")
    assert.equal(hint?.key, 'freq-ignored')
    assert.equal(hint?.subject, 'CLK100')
    assert.match(explainMessage("net 'CLK100' does not exist in design, ignoring clock constraint") ?? '', /no usa ese reloj/)
  })

  it('says nothing about messages it does not know', () => {
    assert.equal(findHint('2.7. Executing SYNTH_ICE40 pass.'), null)
    assert.equal(explainMessage(''), null)
  })
})
