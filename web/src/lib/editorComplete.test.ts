import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { listModuleNames } from '../fpga/pcfCheck.ts'
import {
  collectIdentifiers,
  frequencySuggestions,
  collectModules,
  instantiationSnippet,
  pcfSuggestions,
  VERILOG_SNIPPETS,
} from './editorComplete.ts'

const TOP = `module top_module(
    input  wire CLK12,
    output wire [3:0] LED
);
    wire pll_locked;
    reg [7:0] contador;
endmodule
`

const UART = `module uart_tx(input clk, input wr, output tx);
endmodule
`

const BOARD_PCF = [
  'set_io -nowarn CLK12 49',
  'set_io -nowarn LED[0] 37',
  'set_io -nowarn LED[1] 38',
  'set_io -nowarn LED[2] 39',
  'set_io -nowarn LED[3] 41',
  'set_io -nowarn TX 63',
].join('\n')

describe('collectIdentifiers', () => {
  it('offers signals from the buffer and skips keywords', () => {
    const ids = collectIdentifiers(TOP)
    assert.ok(ids.includes('contador'))
    assert.ok(ids.includes('pll_locked'))
    assert.ok(!ids.includes('module'))
    assert.ok(!ids.includes('wire'))
  })

  it('respects the limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => `sig${i}`).join(' ')
    assert.equal(collectIdentifiers(many, 10).length, 10)
  })
})

describe('listModuleNames', () => {
  it('lists modules without confusing endmodule', () => {
    assert.deepEqual(listModuleNames(`${TOP}\n${UART}`), ['top_module', 'uart_tx'])
  })

  it('ignores modules inside comments', () => {
    assert.deepEqual(listModuleNames('// module fantasma\nmodule real();\nendmodule\n'), ['real'])
  })
})

describe('collectModules', () => {
  it('walks every .v of the project', () => {
    const modules = collectModules([
      { name: 'top_module.v', content: TOP },
      { name: 'uart_tx.v', content: UART },
      { name: 'pins.pcf', content: BOARD_PCF },
    ])
    assert.deepEqual(modules.map((m) => m.name), ['top_module', 'uart_tx'])
    assert.equal(modules[1]?.ports.length, 3)
  })
})

describe('instantiationSnippet', () => {
  it('writes the instance with named ports', () => {
    const [mod] = collectModules([{ name: 'uart_tx.v', content: UART }])
    const snippet = instantiationSnippet(mod!)
    assert.match(snippet, /^uart_tx u_uart_tx \(/)
    assert.match(snippet, /\.clk\(\$\{1:clk\}\)/)
    assert.match(snippet, /\.tx\(\$\{3:tx\}\)/)
  })

  it('handles a module with no ports', () => {
    assert.equal(
      instantiationSnippet({ name: 'sinpuertos', file: 'a.v', ports: [] }),
      'sinpuertos u_sinpuertos ();',
    )
  })
})

describe('pcfSuggestions', () => {
  const ctx = {
    files: [{ name: 'top_module.v', content: TOP }],
    top: 'top_module',
    boardPcf: BOARD_PCF,
    clocks: [],
  }

  it('offers the missing ports with the pin from the board template', () => {
    const out = pcfSuggestions(ctx, 'set_io -nowarn CLK12 49')
    const led0 = out.find((s) => s.label === 'LED[0]')
    assert.equal(led0?.apply, 'set_io -nowarn LED[0] 37')
    assert.match(led0?.detail ?? '', /37/)
    assert.ok(!out.some((s) => s.label === 'CLK12'), 'CLK12 ya estaba')
  })

  it('offers a port with no pin so the user writes it', () => {
    const out = pcfSuggestions(
      { ...ctx, files: [{ name: 'a.v', content: 'module top_module(output wire RARO);\nendmodule' }] },
      '',
    )
    assert.equal(out[0]?.apply, 'set_io -nowarn RARO ')
  })

  it('still offers board pins that the design does not use', () => {
    const out = pcfSuggestions(ctx, '')
    assert.ok(out.some((s) => s.label === 'TX' && s.apply.endsWith('63')))
  })
})

describe('frequencySuggestions', () => {
  const ctx = {
    files: [{ name: 'top_module.v', content: TOP }],
    top: 'top_module',
    boardPcf: BOARD_PCF,
    clocks: [
      { name: 'CLK12', mhz: 12 },
      { name: 'CLK100', mhz: 100 },
    ],
  }

  it('offers the timing constraint of every board clock', () => {
    const out = frequencySuggestions(ctx, '')
    assert.deepEqual(out.map((s) => s.apply), [
      'set_frequency CLK12 12',
      'set_frequency CLK100 100',
    ])
  })

  it('skips the clocks that already have one', () => {
    const out = frequencySuggestions(ctx, 'set_frequency CLK12 12')
    assert.deepEqual(out.map((s) => s.label), ['set_frequency CLK100'])
  })

  it('offers nothing when the board declares no clocks', () => {
    assert.deepEqual(frequencySuggestions({ ...ctx, clocks: [] }, ''), [])
  })
})

describe('snippets', () => {
  it('every snippet has a body with placeholders', () => {
    for (const snippet of VERILOG_SNIPPETS) {
      assert.ok(snippet.body.length > 0, snippet.label)
      assert.match(snippet.body, /\$\{\d/, snippet.label)
    }
  })
})
