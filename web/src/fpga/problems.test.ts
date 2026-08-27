import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseToolLog } from './diagnostics.ts'
import {
  countProblems,
  fromPcfProblems,
  fromToolDiagnostics,
  marksForFile,
  mergeProblems,
} from './problems.ts'

const FILES = ['top_module.v', 'pins.pcf']

const toolProblems = fromToolDiagnostics(
  parseToolLog(
    [
      '======== Yosys (synth_ice40) ========',
      'top_module.v:12: ERROR: syntax error',
      'top_module.v:3: Warning: wire sin driver',
    ],
    { files: FILES },
  ),
)

const pcfProblems = fromPcfProblems([
  {
    severity: 'error',
    code: 'unconstrained',
    message: 'TX no tiene set_io',
    file: 'pins.pcf',
    line: null,
  },
  {
    severity: 'warning',
    code: 'unmatched',
    message: 'LED9 no es un puerto',
    file: 'pins.pcf',
    line: 14,
  },
])

describe('mergeProblems', () => {
  it('puts errors first and keeps file order', () => {
    const merged = mergeProblems(toolProblems, pcfProblems)
    assert.equal(merged.length, 4)
    assert.equal(merged[0]?.severity, 'error')
    assert.equal(merged[1]?.severity, 'error')
    assert.deepEqual(countProblems(merged), { errors: 2, warnings: 2 })
  })

  it('drops duplicates coming from two sources', () => {
    const merged = mergeProblems(toolProblems, toolProblems)
    assert.equal(merged.length, 2)
  })

  it('keeps where each problem came from', () => {
    const merged = mergeProblems(toolProblems, pcfProblems)
    assert.ok(merged.some((p) => p.origin === 'pcf'))
    assert.ok(merged.some((p) => p.origin === 'tool'))
  })
})

describe('hints', () => {
  it('adds an explanation to the messages we know', () => {
    const [problem] = fromToolDiagnostics(
      parseToolLog(['top_module.v:4: Warning: Wire top.suelta is used but has no driver.'], {
        files: FILES,
      }),
    )
    assert.match(problem?.hint ?? '', /nadie la maneja/)
  })

  it('leaves hint null for messages it does not know', () => {
    const [problem] = fromToolDiagnostics(
      parseToolLog(['top_module.v:4: ERROR: algo rarisimo'], { files: FILES }),
    )
    assert.equal(problem?.hint, null)
  })
})

describe('marksForFile', () => {
  it('gives the editor only the lines of the open file', () => {
    const merged = mergeProblems(toolProblems, pcfProblems)
    const marks = marksForFile(merged, 'top_module.v')
    assert.deepEqual(
      marks.map((m) => m.line).sort((a, b) => a - b),
      [3, 12],
    )
  })

  it('skips problems without a line', () => {
    const marks = marksForFile(mergeProblems(pcfProblems), 'pins.pcf')
    assert.equal(marks.length, 1)
    assert.equal(marks[0]?.line, 14)
  })
})
