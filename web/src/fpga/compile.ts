export type CompileFile = { name: string; content: string }

export type CompileResult = {
  status: 'success' | 'compile_error'
  log: string
  bin: Uint8Array | null
}

export type CompileBoard =
  | { kind: 'listed'; id: string }
  | { kind: 'custom'; device: string; package: string; pcf: string }

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function compileFpga(
  files: CompileFile[],
  top: string,
  board: CompileBoard,
): Promise<CompileResult> {
  const body =
    board.kind === 'listed'
      ? { top, files, board: board.id }
      : {
          top,
          files,
          board: 'custom',
          device: board.device,
          package: board.package,
          pcf: board.pcf,
        }
  const res = await fetch('/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 409) {
    throw new Error('COMPILE_BUSY')
  }
  if (res.status === 413) {
    throw new Error('COMPILE_TOO_LARGE')
  }
  if (!res.ok) {
    throw new Error(`Compile HTTP ${res.status}`)
  }
  const payload = (await res.json()) as {
    status?: string
    log?: string
    bin_b64?: string | null
  }
  const status = payload.status === 'success' ? 'success' : 'compile_error'
  const log = typeof payload.log === 'string' ? payload.log : ''
  const bin =
    status === 'success' && typeof payload.bin_b64 === 'string' && payload.bin_b64
      ? b64ToBytes(payload.bin_b64)
      : null
  return { status, log, bin }
}
