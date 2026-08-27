import {
  buildCheckJob,
  buildCompileJob,
  type CompileBoard,
  type CompileFile,
} from '@/fpga/compileArgs'
import type { ArtifactName, WorkerIn, WorkerOut } from '@/fpga/compileProtocol'
import { elapsedLine, nowMs } from '@/fpga/elapsed'
import {
  buildIcebramArgs,
  buildIcebramGenerateArgs,
  buildIcepllArgs,
  type PllRequest,
} from '@/fpga/icetools'
import { i18n } from '@/i18n'

export type { CompileBoard, CompileFile }

export type CompileResult = {
  status: 'success' | 'compile_error'
  log: string
  bin: Uint8Array | null
  /** JSON de `nextpnr --report`: ocupación del chip y Fmax. */
  report: string | null
}

export type CheckResult = {
  /** `skipped` = había otro trabajo en el worker; no es un error. */
  status: 'ok' | 'error' | 'skipped'
  log: string
}

export type PllResult = {
  status: 'success' | 'error'
  log: string
  verilog: string | null
}

export type BramResult = {
  status: 'success' | 'error'
  log: string
  bin: Uint8Array | null
}

export type HexResult = {
  status: 'success' | 'error'
  log: string
  hex: string | null
}

export type CompileLogFn = (line: string) => void

let worker: Worker | null = null
let busy = false
let cancelInflight: (() => void) | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./yowaspWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function isCompilerBusy(): boolean {
  return busy
}

/**
 * Corta lo que esté corriendo. El WASM no sabe abortar: se mata el worker y el
 * próximo trabajo levanta uno nuevo.
 */
export function cancelCompile(): boolean {
  if (!busy) return false
  const reject = cancelInflight
  worker?.terminate()
  worker = null
  busy = false
  cancelInflight = null
  reject?.()
  return true
}

function send<T>(
  payload: WorkerIn,
  onLog: CompileLogFn | undefined,
  accept: (msg: WorkerOut) => { value: T } | null,
): Promise<T> {
  const target = getWorker()
  return new Promise<T>((resolve, reject) => {
    let lastPct = -1
    const detach = () => {
      target.removeEventListener('message', onMessage)
      target.removeEventListener('error', onError)
    }
    const cancelThis = () => {
      detach()
      reject(new Error('COMPILE_CANCELLED'))
    }
    const cleanup = () => {
      detach()
      if (cancelInflight === cancelThis) cancelInflight = null
    }
    const onMessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data
      if (!msg) return
      if (msg.type === 'log') {
        onLog?.(msg.text)
        return
      }
      if (msg.type === 'progress') {
        const pct = msg.total > 0 ? Math.min(100, Math.round((msg.done / msg.total) * 100)) : 0
        if (pct !== lastPct && (pct === 100 || pct % 25 === 0)) {
          lastPct = pct
          onLog?.(String(i18n.global.t('fpga.downloadProgress', { pct })))
        }
        return
      }
      const hit = accept(msg)
      if (!hit) return
      cleanup()
      resolve(hit.value)
    }
    const onError = (event: ErrorEvent) => {
      cleanup()
      reject(new Error(event.message || 'COMPILE_WORKER'))
    }
    cancelInflight = cancelThis
    target.addEventListener('message', onMessage)
    target.addEventListener('error', onError)
    target.postMessage(payload)
  })
}

export async function compileFpga(
  files: CompileFile[],
  top: string,
  board: CompileBoard,
  onLog?: CompileLogFn,
): Promise<CompileResult> {
  if (busy) throw new Error('COMPILE_BUSY')
  const job = buildCompileJob(files, top, board)
  busy = true
  const t0 = nowMs()
  let failed = true
  try {
    const result = await send<CompileResult>({ type: 'compile', job }, onLog, (msg) =>
      msg.type === 'done'
        ? {
            value: {
              status: msg.status,
              log: msg.log,
              bin: msg.bin && msg.bin.byteLength > 0 ? new Uint8Array(msg.bin) : null,
              report: msg.report,
            },
          }
        : null,
    )
    failed = false
    return result
  } finally {
    busy = false
    onLog?.(elapsedLine('Compilar', nowMs() - t0, { failed }))
  }
}

/**
 * Revisión rápida: `read_verilog` + `hierarchy -check`. Misma toolchain, sin
 * place & route, así que contesta en segundos.
 */
export async function checkFpga(
  files: CompileFile[],
  top: string,
  onLog?: CompileLogFn,
): Promise<CheckResult> {
  if (busy) return { status: 'skipped', log: '' }
  const job = buildCheckJob(files, top)
  busy = true
  try {
    return await send<CheckResult>({ type: 'check', job }, onLog, (msg) =>
      msg.type === 'toolDone' && msg.tool === 'check'
        ? { value: { status: msg.status === 'success' ? 'ok' : 'error', log: msg.log } }
        : null,
    )
  } finally {
    busy = false
  }
}

export async function runPll(req: PllRequest, onLog?: CompileLogFn): Promise<PllResult> {
  if (busy) throw new Error('COMPILE_BUSY')
  busy = true
  try {
    return await send<PllResult>(
      { type: 'icepll', job: { args: buildIcepllArgs(req), fileName: req.fileName } },
      onLog,
      (msg) =>
        msg.type === 'toolDone' && msg.tool === 'icepll'
          ? { value: { status: msg.status, log: msg.log, verilog: msg.text } }
          : null,
    )
  } finally {
    busy = false
  }
}

/**
 * Cambia el contenido de una ROM adentro del bitstream ya compilado. El `.asc`
 * quedó en el worker desde el último compile: no hay que sintetizar de nuevo.
 */
export async function runBramSwap(
  from: CompileFile,
  to: CompileFile,
  onLog?: CompileLogFn,
): Promise<BramResult> {
  if (busy) throw new Error('COMPILE_BUSY')
  busy = true
  try {
    return await send<BramResult>(
      {
        type: 'icebram',
        job: {
          args: buildIcebramArgs(from.name, to.name),
          files: { [from.name]: from.content, [to.name]: to.content },
        },
      },
      onLog,
      (msg) =>
        msg.type === 'toolDone' && msg.tool === 'icebram'
          ? {
              value: {
                status: msg.status,
                log: msg.log,
                bin: msg.bin && msg.bin.byteLength > 0 ? new Uint8Array(msg.bin) : null,
              },
            }
          : null,
    )
  } finally {
    busy = false
  }
}

export type ArtifactResult = {
  status: 'success' | 'error'
  text: string | null
  bin: Uint8Array | null
}

/**
 * Baja un intermedio del último compile (`out.json`, `out.asc`, `out.pnr`,
 * `out.bin`). Viven en el worker: no viajan en cada compile.
 */
export async function fetchCompileArtifact(name: ArtifactName): Promise<ArtifactResult> {
  if (busy) throw new Error('COMPILE_BUSY')
  busy = true
  try {
    return await send<ArtifactResult>({ type: 'artifact', name }, undefined, (msg) =>
      msg.type === 'toolDone' && msg.tool === 'artifact'
        ? {
            value: {
              status: msg.status,
              text: msg.text,
              bin: msg.bin && msg.bin.byteLength > 0 ? new Uint8Array(msg.bin) : null,
            },
          }
        : null,
    )
  } finally {
    busy = false
  }
}

export async function generateBramHex(
  widthBits: number,
  words: number,
  onLog?: CompileLogFn,
): Promise<HexResult> {
  if (busy) throw new Error('COMPILE_BUSY')
  busy = true
  try {
    return await send<HexResult>(
      { type: 'icebram-gen', job: { args: buildIcebramGenerateArgs(widthBits, words) } },
      onLog,
      (msg) =>
        msg.type === 'toolDone' && msg.tool === 'icebram-gen'
          ? { value: { status: msg.status, log: msg.log, hex: msg.text } }
          : null,
    )
  } finally {
    busy = false
  }
}
