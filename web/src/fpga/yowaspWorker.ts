import { extractTreeFile, extractTreeText, type CompileTree } from '@/fpga/compileArgs'
import type { WorkerIn, WorkerOut } from '@/fpga/compileProtocol'

type RunFn = (
  args?: string[],
  files?: CompileTree,
  options?: {
    stdout?: ((bytes: Uint8Array | null) => void) | null
    stderr?: ((bytes: Uint8Array | null) => void) | null
    decodeASCII?: boolean
    fetchProgress?: (event: { totalLength: number; doneLength: number }) => void
  },
) => Promise<CompileTree>

type ToolModule = {
  runYosys?: RunFn
  runNextpnrIce40?: RunFn
  runIcepack?: RunFn
  Exit?: new (...args: unknown[]) => Error & { files?: CompileTree }
}

type WorkerScope = {
  postMessage: (msg: WorkerOut) => void
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null
}

const worker = self as unknown as WorkerScope

function lineBuffered(onLine: (line: string) => void): (bytes: Uint8Array | null) => void {
  let acc = ''
  return (bytes) => {
    if (!bytes) {
      if (acc) {
        onLine(acc)
        acc = ''
      }
      return
    }
    acc += new TextDecoder().decode(bytes)
    const parts = acc.split('\n')
    acc = parts.pop() ?? ''
    for (const part of parts) onLine(part)
  }
}

function isExit(err: unknown, Exit: ToolModule['Exit']): err is Error & { files?: CompileTree } {
  if (!err || typeof err !== 'object') return false
  if (Exit && err instanceof Exit) return true
  return 'files' in err && 'code' in err
}

const YOSYS_BUNDLE = '/yowasp/yosys/gen/bundle.js'
const ICE40_BUNDLE = '/yowasp/nextpnr-ice40/gen/bundle.js'

async function loadYosys(): Promise<ToolModule> {
  return import(/* @vite-ignore */ YOSYS_BUNDLE) as Promise<ToolModule>
}

async function loadIce40(): Promise<ToolModule> {
  return import(/* @vite-ignore */ ICE40_BUNDLE) as Promise<ToolModule>
}

worker.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const data = event.data
  if (!data || data.type !== 'compile') return

  const logLines: string[] = []
  const post = (msg: WorkerOut) => worker.postMessage(msg)
  const log = (text: string) => {
    logLines.push(text)
    post({ type: 'log', text })
  }
  const sink = lineBuffered((line) => log(line))
  const fetchProgress = (event: { totalLength: number; doneLength: number }) => {
    if (event.totalLength > 0) {
      post({ type: 'progress', done: event.doneLength, total: event.totalLength })
    }
  }
  const opts = { stdout: sink, stderr: sink, decodeASCII: false, fetchProgress }

  let files: CompileTree = { ...data.job.files }
  try {
    log('======== Yosys (synth_ice40) ========')
    const yosys = await loadYosys()
    if (!yosys.runYosys) throw new Error('YoWASP Yosys did not export runYosys')
    try {
      files = await yosys.runYosys(data.job.yosysArgs, files, opts)
    } catch (err) {
      if (isExit(err, yosys.Exit)) {
        files = err.files ?? files
        finish('compile_error', files, logLines, post, log)
        return
      }
      throw err
    }

    log('======== nextpnr-ice40 ========')
    const ice = await loadIce40()
    if (!ice.runNextpnrIce40 || !ice.runIcepack) {
      throw new Error('YoWASP nextpnr-ice40 did not export runNextpnrIce40/runIcepack')
    }
    try {
      files = await ice.runNextpnrIce40(data.job.nextpnrArgs, files, opts)
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        files = err.files ?? files
        finish('compile_error', files, logLines, post, log)
        return
      }
      throw err
    }

    log('======== icepack ========')
    try {
      files = await ice.runIcepack(data.job.icepackArgs, files, opts)
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        files = err.files ?? files
        finish('compile_error', files, logLines, post, log)
        return
      }
      throw err
    }

    finish('success', files, logLines, post, log)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`compile worker: ${msg}`)
    post({ type: 'done', status: 'compile_error', log: logLines.join('\n'), bin: null })
  }
}

function finish(
  status: 'success' | 'compile_error',
  files: CompileTree,
  logLines: string[],
  post: (msg: WorkerOut) => void,
  log: (text: string) => void,
): void {
  const report = extractTreeText(files, 'out.pnr')
  if (report) {
    log('======== nextpnr --report ========')
    log(report.slice(0, 8000))
  }
  const bin = extractTreeFile(files, 'out.bin')
  if (status === 'success' && (!bin || bin.length <= 0)) {
    post({
      type: 'done',
      status: 'compile_error',
      log: logLines.join('\n').trim() || 'no out.bin',
      bin: null,
    })
    return
  }
  const copy = bin && bin.length > 0 ? bin.slice() : null
  post({
    type: 'done',
    status,
    log: logLines.join('\n').trim(),
    bin: copy ? copy.buffer : null,
  })
}
