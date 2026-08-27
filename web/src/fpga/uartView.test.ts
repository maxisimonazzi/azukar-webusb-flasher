import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createPlotSeries,
  createUartState,
  parsePlotValues,
  plotBounds,
  pushPlotSample,
  pushUartChunk,
  renderUartHex,
  renderUartText,
  UART_MAX_LINES,
  withLineEnding,
} from './uartView.ts'

const enc = new TextEncoder()

function feed(state: ReturnType<typeof createUartState>, text: string, ts = 1000) {
  pushUartChunk(state, text, enc.encode(text), ts)
}

describe('uart buffer', () => {
  it('joins chunks into lines', () => {
    const state = createUartState()
    feed(state, 'Hola ')
    feed(state, 'UART\nsegunda')
    assert.equal(renderUartText(state), 'Hola UART\nsegunda')
  })

  it('drops CR so CRLF does not double the lines', () => {
    const state = createUartState()
    feed(state, 'a\r\nb\r\n')
    assert.equal(renderUartText(state), 'a\nb')
  })

  it('stamps each line with the time of its first byte', () => {
    const state = createUartState()
    feed(state, 'uno\n', new Date(2026, 0, 2, 14, 3, 22, 481).getTime())
    const out = renderUartText(state, { timestamps: true })
    assert.match(out, /^\[14:03:22\.481\] uno$/)
  })

  it('bounds the number of lines it keeps', () => {
    const state = createUartState()
    for (let i = 0; i < UART_MAX_LINES + 50; i += 1) feed(state, `l${i}\n`)
    assert.equal(state.lines.length, UART_MAX_LINES)
    assert.match(renderUartText(state), /l2049$/)
  })

  it('shows the raw bytes as a hex dump', () => {
    const state = createUartState()
    feed(state, 'AB')
    const dump = renderUartHex(state)
    assert.match(dump, /00000000\s+41 42/)
    assert.match(dump, /\|AB\|/)
  })

  it('has nothing to show before the first byte', () => {
    assert.equal(renderUartHex(createUartState()), '')
    assert.equal(renderUartText(createUartState()), '')
  })
})

describe('plotter', () => {
  it('reads plain numbers separated by commas or spaces', () => {
    assert.deepEqual(parsePlotValues('12, 34'), { labels: ['s1', 's2'], values: [12, 34] })
    assert.deepEqual(parsePlotValues('-1.5 2'), { labels: ['s1', 's2'], values: [-1.5, 2] })
  })

  it('reads named series', () => {
    assert.deepEqual(parsePlotValues('temp:21.5 hum:60'), {
      labels: ['temp', 'hum'],
      values: [21.5, 60],
    })
  })

  it('ignores lines that are text', () => {
    assert.equal(parsePlotValues('Hola UART'), null)
    assert.equal(parsePlotValues(''), null)
    assert.equal(parsePlotValues('12, hola'), null)
  })

  it('accumulates samples and bounds them', () => {
    const series = createPlotSeries()
    for (let i = 0; i < 20; i += 1) {
      pushPlotSample(series, { labels: ['a', 'b'], values: [i, -i] }, 10)
    }
    assert.equal(series.rows.length, 2)
    assert.equal(series.rows[0]?.length, 10)
    assert.deepEqual(series.labels, ['a', 'b'])
    assert.deepEqual(plotBounds(series), { min: -19, max: 19 })
  })

  it('falls back to a sane range with no data', () => {
    assert.deepEqual(plotBounds(createPlotSeries()), { min: 0, max: 1 })
  })
})

describe('line endings', () => {
  it('adds what the firmware expects', () => {
    assert.equal(withLineEnding('a', 'none'), 'a')
    assert.equal(withLineEnding('a', 'lf'), 'a\n')
    assert.equal(withLineEnding('a', 'crlf'), 'a\r\n')
  })
})
