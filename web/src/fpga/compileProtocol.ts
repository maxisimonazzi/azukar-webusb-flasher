import type { CompileJob } from '@/fpga/compileArgs'

export type WorkerIn = { type: 'compile'; job: CompileJob }

export type WorkerOut =
  | { type: 'log'; text: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; status: 'success' | 'compile_error'; log: string; bin: ArrayBuffer | null }
