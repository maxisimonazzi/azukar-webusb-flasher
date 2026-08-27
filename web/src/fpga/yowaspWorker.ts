import { extractTreeFile, extractTreeText, type CompileTree } from '@/fpga/compileArgs'
import type { ToolName, WorkerIn, WorkerOut } from '@/fpga/compileProtocol'

type InputStream = (byteLength: number) => Uint8Array | null

type RunFn = (
  args?: string[],
  files?: CompileTree,
  options?: {
    stdin?: InputStream | null
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
  runIcepll?: RunFn
  runIcebram?: RunFn
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

/** `icebram` lee el `.asc` por stdin y escribe el nuevo por stdout. */
function stdinFromText(text: string): InputStream {
  const bytes = new TextEncoder().encode(text)
  let at = 0
  return (byteLength: number) => {
    if (at >= bytes.length) return null
    const end = Math.min(bytes.length, at + Math.max(1, byteLength))
    const chunk = bytes.slice(at, end)
    at = end
    return chunk
  }
}

function collector(): { sink: (b: Uint8Array | null) => void; text: () => string } {
  const chunks: Uint8Array[] = []
  return {
    sink: (bytes) => {
      if (bytes) chunks.push(bytes.slice())
    },
    text: () => {
      let total = 0
      for (const c of chunks) total += c.length
      const out = new Uint8Array(total)
      let at = 0
      for (const c of chunks) {
        out.set(c, at)
        at += c.length
      }
      return new TextDecoder().decode(out)
    },
  }
}

// nginx sirve los WASM al lado de la SPA. BASE_URL termina en '/' y vale '/'
// en la raíz o '/grabador-lattice-webusb/' si la app va bajo un prefijo.
const YOSYS_BUNDLE = `${import.meta.env.BASE_URL}yowasp/yosys/gen/bundle.js`
const ICE40_BUNDLE = `${import.meta.env.BASE_URL}yowasp/nextpnr-ice40/gen/bundle.js`

async function loadYosys(): Promise<ToolModule> {
  return import(/* @vite-ignore */ YOSYS_BUNDLE) as Promise<ToolModule>
}

async function loadIce40(): Promise<ToolModule> {
  return import(/* @vite-ignore */ ICE40_BUNDLE) as Promise<ToolModule>
}

/**
 * El árbol de salida del último compile exitoso. `icebram` necesita ese
 * `out.asc` y no tiene sentido mandarlo de ida y vuelta (son megas de texto).
 */
let lastCompileFiles: CompileTree | null = null

type Session = {
  log: (text: string) => void
  logLines: string[]
  post: (msg: WorkerOut) => void
  opts: {
    stdout: (b: Uint8Array | null) => void
    stderr: (b: Uint8Array | null) => void
    decodeASCII: boolean
    fetchProgress: (e: { totalLength: number; doneLength: number }) => void
  }
}

function startSession(): Session {
  const logLines: string[] = []
  const post = (msg: WorkerOut) => worker.postMessage(msg)
  const log = (text: string) => {
    logLines.push(text)
    post({ type: 'log', text })
  }
  const sink = lineBuffered(log)
  const fetchProgress = (event: { totalLength: number; doneLength: number }) => {
    if (event.totalLength > 0) {
      post({ type: 'progress', done: event.doneLength, total: event.totalLength })
    }
  }
  return {
    log,
    logLines,
    post,
    opts: { stdout: sink, stderr: sink, decodeASCII: false, fetchProgress },
  }
}

function toolDone(
  s: Session,
  tool: ToolName,
  status: 'success' | 'error',
  text: string | null = null,
  bin: ArrayBuffer | null = null,
): void {
  s.post({ type: 'toolDone', tool, status, log: s.logLines.join('\n').trim(), text, bin })
}

async function doCompile(job: Extract<WorkerIn, { type: 'compile' }>['job']): Promise<void> {
  const s = startSession()
  let files: CompileTree = { ...job.files }
  try {
    s.log('======== Yosys (synth_ice40) ========')
    const yosys = await loadYosys()
    if (!yosys.runYosys) throw new Error('YoWASP Yosys did not export runYosys')
    try {
      files = await yosys.runYosys(job.yosysArgs, files, s.opts)
    } catch (err) {
      if (isExit(err, yosys.Exit)) {
        finish('compile_error', err.files ?? files, s)
        return
      }
      throw err
    }

    s.log('======== nextpnr-ice40 ========')
    const ice = await loadIce40()
    if (!ice.runNextpnrIce40 || !ice.runIcepack) {
      throw new Error('YoWASP nextpnr-ice40 did not export runNextpnrIce40/runIcepack')
    }
    try {
      files = await ice.runNextpnrIce40(job.nextpnrArgs, files, s.opts)
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        finish('compile_error', err.files ?? files, s)
        return
      }
      throw err
    }

    s.log('======== icepack ========')
    try {
      files = await ice.runIcepack(job.icepackArgs, files, s.opts)
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        finish('compile_error', err.files ?? files, s)
        return
      }
      throw err
    }

    finish('success', files, s)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    s.log(`compile worker: ${msg}`)
    s.post({
      type: 'done',
      status: 'compile_error',
      log: s.logLines.join('\n'),
      bin: null,
      report: null,
    })
  }
}

function finish(status: 'success' | 'compile_error', files: CompileTree, s: Session): void {
  const report = extractTreeText(files, 'out.pnr')
  const bin = extractTreeFile(files, 'out.bin')
  lastCompileFiles = status === 'success' ? files : null
  if (status === 'success' && (!bin || bin.length <= 0)) {
    s.post({
      type: 'done',
      status: 'compile_error',
      log: s.logLines.join('\n').trim() || 'no out.bin',
      bin: null,
      report,
    })
    return
  }
  const copy = bin && bin.length > 0 ? bin.slice() : null
  s.post({
    type: 'done',
    status,
    log: s.logLines.join('\n').trim(),
    bin: copy ? copy.buffer : null,
    report,
  })
}

async function doCheck(job: Extract<WorkerIn, { type: 'check' }>['job']): Promise<void> {
  const s = startSession()
  try {
    const yosys = await loadYosys()
    if (!yosys.runYosys) throw new Error('YoWASP Yosys did not export runYosys')
    try {
      await yosys.runYosys(job.yosysArgs, { ...job.files }, s.opts)
    } catch (err) {
      if (isExit(err, yosys.Exit)) {
        toolDone(s, 'check', 'error')
        return
      }
      throw err
    }
    toolDone(s, 'check', 'success')
  } catch (err) {
    s.log(`check: ${err instanceof Error ? err.message : String(err)}`)
    toolDone(s, 'check', 'error')
  }
}

async function doIcepll(job: Extract<WorkerIn, { type: 'icepll' }>['job']): Promise<void> {
  const s = startSession()
  try {
    const ice = await loadIce40()
    if (!ice.runIcepll) throw new Error('YoWASP nextpnr-ice40 did not export runIcepll')
    let files: CompileTree = {}
    try {
      files = await ice.runIcepll(job.args, {}, s.opts)
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        toolDone(s, 'icepll', 'error')
        return
      }
      throw err
    }
    const verilog = extractTreeText(files, job.fileName)
    toolDone(s, 'icepll', verilog ? 'success' : 'error', verilog)
  } catch (err) {
    s.log(`icepll: ${err instanceof Error ? err.message : String(err)}`)
    toolDone(s, 'icepll', 'error')
  }
}

async function doIcebram(job: Extract<WorkerIn, { type: 'icebram' }>['job']): Promise<void> {
  const s = startSession()
  try {
    const asc = lastCompileFiles ? extractTreeText(lastCompileFiles, 'out.asc') : null
    if (!asc) {
      s.log('icebram: no tengo el out.asc del último compile. Compilá y volvé a probar.')
      toolDone(s, 'icebram', 'error')
      return
    }
    const ice = await loadIce40()
    if (!ice.runIcebram || !ice.runIcepack) {
      throw new Error('YoWASP nextpnr-ice40 did not export runIcebram/runIcepack')
    }
    s.log('======== icebram ========')
    const out = collector()
    try {
      await ice.runIcebram(job.args, { ...job.files }, {
        ...s.opts,
        stdin: stdinFromText(asc),
        stdout: out.sink,
      })
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        toolDone(s, 'icebram', 'error')
        return
      }
      throw err
    }
    const newAsc = out.text()
    if (!newAsc.trim()) {
      s.log('icebram: no salió ningún .asc nuevo.')
      toolDone(s, 'icebram', 'error')
      return
    }
    s.log('======== icepack ========')
    let packed: CompileTree = {}
    try {
      packed = await ice.runIcepack(['new.asc', 'new.bin'], { 'new.asc': newAsc }, s.opts)
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        toolDone(s, 'icebram', 'error')
        return
      }
      throw err
    }
    const bin = extractTreeFile(packed, 'new.bin')
    if (!bin || bin.length === 0) {
      toolDone(s, 'icebram', 'error')
      return
    }
    // El .asc nuevo pasa a ser el vigente: se puede volver a cambiar la ROM.
    lastCompileFiles = { ...(lastCompileFiles ?? {}), 'out.asc': newAsc }
    const copy = bin.slice()
    toolDone(s, 'icebram', 'success', null, copy.buffer)
  } catch (err) {
    s.log(`icebram: ${err instanceof Error ? err.message : String(err)}`)
    toolDone(s, 'icebram', 'error')
  }
}

async function doIcebramGen(
  job: Extract<WorkerIn, { type: 'icebram-gen' }>['job'],
): Promise<void> {
  const s = startSession()
  try {
    const ice = await loadIce40()
    if (!ice.runIcebram) throw new Error('YoWASP nextpnr-ice40 did not export runIcebram')
    const out = collector()
    try {
      await ice.runIcebram(job.args, {}, { ...s.opts, stdout: out.sink })
    } catch (err) {
      if (isExit(err, ice.Exit)) {
        toolDone(s, 'icebram-gen', 'error')
        return
      }
      throw err
    }
    const hex = out.text()
    toolDone(s, 'icebram-gen', hex.trim() ? 'success' : 'error', hex)
  } catch (err) {
    s.log(`icebram -g: ${err instanceof Error ? err.message : String(err)}`)
    toolDone(s, 'icebram-gen', 'error')
  }
}

/** Un intermedio del último compile, para bajarlo sin recompilar. */
function doArtifact(name: Extract<WorkerIn, { type: 'artifact' }>['name']): void {
  const s = startSession()
  const files = lastCompileFiles
  if (!files) {
    s.log(`no tengo ${name}: compilá una vez y volvé a probar.`)
    toolDone(s, 'artifact', 'error')
    return
  }
  if (name === 'out.bin') {
    const bin = extractTreeFile(files, name)
    if (!bin || bin.length === 0) {
      toolDone(s, 'artifact', 'error')
      return
    }
    const copy = bin.slice()
    toolDone(s, 'artifact', 'success', null, copy.buffer)
    return
  }
  const text = extractTreeText(files, name)
  toolDone(s, 'artifact', text ? 'success' : 'error', text)
}

worker.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const data = event.data
  if (!data) return
  switch (data.type) {
    case 'compile':
      await doCompile(data.job)
      return
    case 'artifact':
      doArtifact(data.name)
      return
    case 'check':
      await doCheck(data.job)
      return
    case 'icepll':
      await doIcepll(data.job)
      return
    case 'icebram':
      await doIcebram(data.job)
      return
    case 'icebram-gen':
      await doIcebramGen(data.job)
      return
    default: {
      const _exhaustive: never = data
      return _exhaustive
    }
  }
}
