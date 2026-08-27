import type { CheckJob, CompileJob } from '@/fpga/compileArgs'

/** Las herramientas sueltas de IceStorm que corren en el mismo worker. */
export type ToolName = 'check' | 'icepll' | 'icebram' | 'icebram-gen' | 'artifact'

/**
 * Archivos intermedios del último compile. Quedan en el worker (son megas) y se
 * piden solo cuando el usuario los quiere bajar.
 *   out.json → netlist de Yosys (lo come netlistsvg y un simulador)
 *   out.asc  → bitstream en texto (icebram, icetime, diffs)
 *   out.pnr  → reporte de nextpnr (ocupación y timing)
 *   out.bin  → el bitstream que se graba
 */
export const ARTIFACT_NAMES = ['out.bin', 'out.asc', 'out.json', 'out.pnr'] as const
export type ArtifactName = (typeof ARTIFACT_NAMES)[number]

export type PllJob = {
  args: string[]
  /** Archivo que icepll escribe con `-m -f`. */
  fileName: string
}

export type BramJob = {
  args: string[]
  /** Los dos `.hex`: el que está adentro del bitstream y el nuevo. */
  files: Record<string, string>
}

export type HexGenJob = {
  args: string[]
}

export type WorkerIn =
  | { type: 'compile'; job: CompileJob }
  | { type: 'check'; job: CheckJob }
  | { type: 'icepll'; job: PllJob }
  | { type: 'icebram'; job: BramJob }
  | { type: 'icebram-gen'; job: HexGenJob }
  | { type: 'artifact'; name: ArtifactName }

export type WorkerOut =
  | { type: 'log'; text: string }
  | { type: 'progress'; done: number; total: number }
  | {
      type: 'done'
      status: 'success' | 'compile_error'
      log: string
      bin: ArrayBuffer | null
      /** `out.pnr`: el JSON de `nextpnr --report` (ocupación y Fmax). */
      report: string | null
    }
  | {
      type: 'toolDone'
      tool: ToolName
      status: 'success' | 'error'
      log: string
      /** Texto generado: el módulo del PLL o el `.hex` de icebram -g. */
      text: string | null
      /** Bitstream nuevo cuando icebram reemplazó una ROM. */
      bin: ArrayBuffer | null
    }
