/**
 * El proyecto entero dentro del link. No hay servidor donde guardarlo: los
 * archivos van comprimidos (deflate-raw) y en base64url en el **fragmento**
 * (`#p=…`), que el navegador nunca manda al server.
 */

export type ShareFile = { name: string; content: string }

export type ShareProject = {
  top: string
  boardId: string
  files: ShareFile[]
}

export const SHARE_PARAM = 'p'
export const MAX_SHARE_FILES = 100
export const MAX_SHARE_CHARS = 1_000_000
/** Arriba de esto muchos navegadores empiezan a cortar la URL. */
export const SHARE_URL_WARN = 8_000

const CODEC_PLAIN = '0'
const CODEC_DEFLATE = '1'

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array | null {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const bin = atob(padded)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function streamThrough(bytes: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  void writer.write(bytes)
  void writer.close()
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.readable.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
    }
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

function hasCompression(): boolean {
  return typeof CompressionStream !== 'undefined'
}

/** Payload chico: nombres cortos para que el link no crezca al pedo. */
type Wire = { v: 1; t: string; b: string; f: [string, string][] }

export async function encodeShareProject(project: ShareProject): Promise<string> {
  const wire: Wire = {
    v: 1,
    t: project.top,
    b: project.boardId,
    f: project.files.map((f) => [f.name, f.content]),
  }
  const json = JSON.stringify(wire)
  const raw = new TextEncoder().encode(json)
  if (!hasCompression()) return CODEC_PLAIN + toBase64Url(raw)
  try {
    const packed = await streamThrough(raw, new CompressionStream('deflate-raw'))
    return CODEC_DEFLATE + toBase64Url(packed)
  } catch {
    return CODEC_PLAIN + toBase64Url(raw)
  }
}

function parseWire(json: string): ShareProject | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const wire = data as Partial<Wire>
  if (wire.v !== 1 || !Array.isArray(wire.f) || wire.f.length === 0) return null
  if (wire.f.length > MAX_SHARE_FILES) return null
  const files: ShareFile[] = []
  let total = 0
  for (const item of wire.f) {
    if (!Array.isArray(item) || item.length !== 2) return null
    const [name, content] = item
    if (typeof name !== 'string' || typeof content !== 'string') return null
    total += name.length + content.length
    if (total > MAX_SHARE_CHARS) return null
    files.push({ name, content })
  }
  return {
    top: typeof wire.t === 'string' ? wire.t : '',
    boardId: typeof wire.b === 'string' ? wire.b : '',
    files,
  }
}

export async function decodeShareProject(code: string): Promise<ShareProject | null> {
  const trimmed = code.trim()
  if (trimmed.length < 2) return null
  const codec = trimmed[0]
  const body = fromBase64Url(trimmed.slice(1))
  if (!body) return null
  if (codec === CODEC_PLAIN) {
    return parseWire(new TextDecoder().decode(body))
  }
  if (codec !== CODEC_DEFLATE || typeof DecompressionStream === 'undefined') return null
  try {
    const raw = await streamThrough(body, new DecompressionStream('deflate-raw'))
    return parseWire(new TextDecoder().decode(raw))
  } catch {
    return null
  }
}

/** El código va en el fragmento: no viaja al servidor ni queda en sus logs. */
export function buildShareUrl(href: string, code: string): string {
  const base = href.split('#')[0] ?? href
  return `${base}#${SHARE_PARAM}=${code}`
}

export function readShareCode(hash: string): string | null {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash
  if (!clean) return null
  for (const part of clean.split('&')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    if (part.slice(0, eq) !== SHARE_PARAM) continue
    const value = part.slice(eq + 1).trim()
    if (value) return value
  }
  return null
}
