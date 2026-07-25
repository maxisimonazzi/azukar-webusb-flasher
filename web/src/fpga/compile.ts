import { buildCompileJob, type CompileBoard, type CompileFile } from '@/fpga/compileArgs'
import type { WorkerIn, WorkerOut } from '@/fpga/compileProtocol'

export type { CompileBoard, CompileFile }

export type CompileBackend = 'server' | 'yowasp'

export function compileBackend(): CompileBackend {
  return import.meta.env.VITE_COMPILE_BACKEND === 'server' ? 'server' : 'yowasp'
}

export type CompileResult = {
  status: 'success' | 'compile_error'
  log: string
  bin: Uint8Array | null
}

export type CompileLogFn = (line: string) => void

let worker: Worker | null = null
let compiling = false

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./yowaspWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function compileOnServer(
  files: CompileFile[],
  top: string,
  board: CompileBoard,
  onLog?: CompileLogFn,
): Promise<CompileResult> {
  const res = await fetch('/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      top,
      files,
      board: 'custom',
      device: board.device,
      package: board.package,
      pcf: board.pcf,
    }),
  })
  if (res.status === 409) throw new Error('COMPILE_BUSY')
  if (res.status === 413) throw new Error('COMPILE_TOO_LARGE')
  if (!res.ok) throw new Error(`Compile HTTP ${res.status}`)
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
  if (onLog && log) {
    for (const line of log.split('\n')) onLog(line)
  }
  return { status, log, bin }
}

function compileInBrowser(
  files: CompileFile[],
  top: string,
  board: CompileBoard,
  onLog?: CompileLogFn,
): Promise<CompileResult> {
  const job = buildCompileJob(files, top, board)
  const target = getWorker()
  return new Promise((resolve, reject) => {
    let lastPct = -1
    const onMessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data
      if (!msg) return
      switch (msg.type) {
        case 'log':
          onLog?.(msg.text)
          return
        case 'progress': {
          const pct = msg.total > 0 ? Math.min(100, Math.round((msg.done / msg.total) * 100)) : 0
          if (pct !== lastPct && (pct === 100 || pct % 25 === 0)) {
            lastPct = pct
            onLog?.(`YoWASP ${pct}%`)
          }
          return
        }
        case 'done': {
          cleanup()
          const bin =
            msg.bin && msg.bin.byteLength > 0 ? new Uint8Array(msg.bin) : null
          resolve({ status: msg.status, log: msg.log, bin })
          return
        }
        default: {
          const _exhaustive: never = msg
          return _exhaustive
        }
      }
    }
    const onError = (event: ErrorEvent) => {
      cleanup()
      reject(new Error(event.message || 'COMPILE_WORKER'))
    }
    const cleanup = () => {
      target.removeEventListener('message', onMessage)
      target.removeEventListener('error', onError)
    }
    target.addEventListener('message', onMessage)
    target.addEventListener('error', onError)
    const payload: WorkerIn = { type: 'compile', job }
    target.postMessage(payload)
  })
}

export async function compileFpga(
  files: CompileFile[],
  top: string,
  board: CompileBoard,
  onLog?: CompileLogFn,
): Promise<CompileResult> {
  if (compiling) throw new Error('COMPILE_BUSY')
  compiling = true
  try {
    if (compileBackend() === 'server') return await compileOnServer(files, top, board, onLog)
    return await compileInBrowser(files, top, board, onLog)
  } finally {
    compiling = false
  }
}
