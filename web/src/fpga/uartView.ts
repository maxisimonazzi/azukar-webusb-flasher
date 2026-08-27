/**
 * La consola UART con timestamps, vista hexadecimal y plotter. El stream llega
 * en pedazos: acá se arma por líneas, se guardan los bytes crudos para el hex y
 * se sacan los números para el gráfico.
 */

import { formatHexDump } from './flashDump.ts'

export type UartLine = {
  /** `Date.now()` del primer byte de la línea. */
  ts: number
  text: string
}

export type UartState = {
  lines: UartLine[]
  /** Línea a medio llegar (todavía sin `\n`). */
  partial: UartLine | null
  bytes: Uint8Array
  byteCount: number
}

export const UART_MAX_LINES = 2000
export const UART_MAX_BYTES = 65536
/** Muestras que guarda el plotter (una por línea con números). */
export const UART_MAX_SAMPLES = 600

export function createUartState(): UartState {
  return { lines: [], partial: null, bytes: new Uint8Array(0), byteCount: 0 }
}

function pushBytes(state: UartState, chunk: Uint8Array): void {
  if (chunk.length === 0) return
  const combined = new Uint8Array(state.bytes.length + chunk.length)
  combined.set(state.bytes, 0)
  combined.set(chunk, state.bytes.length)
  state.bytes =
    combined.length > UART_MAX_BYTES
      ? combined.slice(combined.length - UART_MAX_BYTES)
      : combined
  state.byteCount += chunk.length
}

/**
 * Suma un pedazo del puerto. `text` ya viene decodificado (el TextDecoder vive
 * en el llamador para no perder caracteres partidos entre chunks).
 */
export function pushUartChunk(
  state: UartState,
  text: string,
  bytes: Uint8Array | null,
  ts: number,
): void {
  if (bytes) pushBytes(state, bytes)
  if (!text) return
  let current = state.partial ?? { ts, text: '' }
  for (const ch of text) {
    if (ch === '\r') continue
    if (ch === '\n') {
      state.lines.push(current)
      current = { ts, text: '' }
      continue
    }
    current.text += ch
  }
  state.partial = current.text ? current : null
  if (state.lines.length > UART_MAX_LINES) {
    state.lines.splice(0, state.lines.length - UART_MAX_LINES)
  }
}

export function clearUartState(state: UartState): void {
  state.lines = []
  state.partial = null
  state.bytes = new Uint8Array(0)
  state.byteCount = 0
}

/** `14:03:22.481`, hora local. Sin fecha: la consola no da para tanto. */
export function formatUartTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export function renderUartText(state: UartState, opts?: { timestamps?: boolean }): string {
  const all = state.partial ? [...state.lines, state.partial] : state.lines
  if (!opts?.timestamps) return all.map((l) => l.text).join('\n')
  return all.map((l) => `[${formatUartTime(l.ts)}] ${l.text}`).join('\n')
}

export function renderUartHex(state: UartState): string {
  if (state.bytes.length === 0) return ''
  const base = Math.max(0, state.byteCount - state.bytes.length)
  return formatHexDump(state.bytes, base)
}

export type PlotSample = {
  labels: string[]
  values: number[]
}

const NUMBER_RE = /^-?\d+(?:\.\d+)?$/

/**
 * `12, 34` → dos series. `temp:21.5 hum:60` → series con nombre. Cualquier cosa
 * que no sea número corta: esa línea es texto, no datos.
 */
export function parsePlotValues(line: string): PlotSample | null {
  const clean = line.trim()
  if (!clean) return null
  const tokens = clean.split(/[\s,;]+/).filter(Boolean)
  if (tokens.length === 0) return null
  const labels: string[] = []
  const values: number[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? ''
    const colon = token.indexOf(':')
    if (colon > 0) {
      const name = token.slice(0, colon)
      const raw = token.slice(colon + 1)
      if (!NUMBER_RE.test(raw)) return null
      labels.push(name)
      values.push(Number(raw))
      continue
    }
    if (!NUMBER_RE.test(token)) return null
    labels.push(`s${i + 1}`)
    values.push(Number(token))
  }
  return { labels, values }
}

export type PlotSeries = {
  labels: string[]
  /** Una fila por serie, en orden de llegada. */
  rows: number[][]
}

export function createPlotSeries(): PlotSeries {
  return { labels: [], rows: [] }
}

export function pushPlotSample(
  series: PlotSeries,
  sample: PlotSample,
  max = UART_MAX_SAMPLES,
): void {
  while (series.rows.length < sample.values.length) {
    series.rows.push([])
    series.labels.push(sample.labels[series.rows.length - 1] ?? `s${series.rows.length}`)
  }
  sample.labels.forEach((label, i) => {
    if (label && !label.startsWith('s')) series.labels[i] = label
  })
  series.rows.forEach((row, i) => {
    row.push(sample.values[i] ?? Number.NaN)
    if (row.length > max) row.splice(0, row.length - max)
  })
}

export function plotBounds(series: PlotSeries): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const row of series.rows) {
    for (const value of row) {
      if (!Number.isFinite(value)) continue
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
}

export const UART_LINE_ENDINGS = ['none', 'lf', 'crlf'] as const
export type UartLineEnding = (typeof UART_LINE_ENDINGS)[number]

export function withLineEnding(text: string, ending: UartLineEnding): string {
  switch (ending) {
    case 'lf':
      return `${text}\n`
    case 'crlf':
      return `${text}\r\n`
    case 'none':
      return text
    default: {
      const _exhaustive: never = ending
      return _exhaustive
    }
  }
}
