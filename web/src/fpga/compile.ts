import { buildCompileJob, type CompileBoard, type CompileFile } from '@/fpga/compileArgs'
import type { WorkerIn, WorkerOut } from '@/fpga/compileProtocol'
import { elapsedLine, nowMs } from '@/fpga/elapsed'
import { i18n } from '@/i18n'

export type { CompileBoard, CompileFile }

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
            onLog?.(String(i18n.global.t('fpga.downloadProgress', { pct })))
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
  const t0 = nowMs()
  let failed = true
  try {
    const result = await compileInBrowser(files, top, board, onLog)
    failed = false
    return result
  } finally {
    compiling = false
    onLog?.(elapsedLine('Compilar', nowMs() - t0, { failed }))
  }
}
