export type CompileFile = { name: string; content: string }

export type CompileResult = {
  status: 'success' | 'compile_error'
  log: string
  bin: Uint8Array | null
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function compileFpga(
  files: CompileFile[],
  top: string,
): Promise<CompileResult> {
  const res = await fetch('/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ top, files }),
  })
  if (res.status === 409) {
    throw new Error('Ya hay una compilación en curso.')
  }
  if (res.status === 413) {
    throw new Error('El Verilog es demasiado grande.')
  }
  if (!res.ok) {
    throw new Error(`Compile HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    status?: string
    log?: string
    bin_b64?: string | null
  }
  const status = body.status === 'success' ? 'success' : 'compile_error'
  const log = typeof body.log === 'string' ? body.log : ''
  const bin =
    status === 'success' && typeof body.bin_b64 === 'string' && body.bin_b64
      ? b64ToBytes(body.bin_b64)
      : null
  return { status, log, bin }
}
