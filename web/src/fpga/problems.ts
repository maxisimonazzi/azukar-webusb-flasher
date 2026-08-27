/**
 * Una sola lista de problemas para la pestaña "Problemas": lo que dijeron las
 * herramientas (Yosys/nextpnr) y lo que se ve sin compilar (cruce PCF ↔ top).
 */

import type { ToolDiagnostic } from './diagnostics.ts'
import { explainMessage } from './hints.ts'
import type { PcfProblem } from './pcfCheck.ts'

export type ProblemOrigin = 'tool' | 'pcf'

export type Problem = {
  id: string
  severity: 'error' | 'warning'
  message: string
  /** Archivo del proyecto, o `null` si el mensaje no lo dice. */
  file: string | null
  line: number | null
  origin: ProblemOrigin
  /** Línea del log de donde salió, para saltar a la consola. */
  logIndex: number | null
  /** Traducción a "qué te pasó y qué hacer", cuando conocemos el mensaje. */
  hint: string | null
}

export type EditorMarkLike = {
  line: number
  severity: 'error' | 'warning'
  message: string
}

export const MAX_PROBLEMS = 200

function keyOf(p: Omit<Problem, 'id'>): string {
  return `${p.origin}:${p.file ?? ''}:${p.line ?? 0}:${p.severity}:${p.message}`
}

export function fromToolDiagnostics(list: ToolDiagnostic[]): Problem[] {
  return list.map((d) => {
    const base = {
      severity: d.severity,
      message: d.message,
      file: d.file,
      line: d.line,
      origin: 'tool' as const,
      logIndex: d.logIndex,
      hint: explainMessage(d.message),
    }
    return { id: keyOf(base), ...base }
  })
}

export function fromPcfProblems(list: PcfProblem[]): Problem[] {
  return list.map((p) => {
    const base = {
      severity: p.severity,
      message: p.message,
      file: p.file || null,
      line: p.line,
      origin: 'pcf' as const,
      logIndex: null,
      // El chequeo de pines ya escribe el mensaje en criollo.
      hint: null,
    }
    return { id: keyOf(base), ...base }
  })
}

/** Errores primero, después por archivo y línea. Sin repetidos. */
export function mergeProblems(...groups: Problem[][]): Problem[] {
  const seen = new Set<string>()
  const out: Problem[] = []
  for (const group of groups) {
    for (const problem of group) {
      if (seen.has(problem.id)) continue
      seen.add(problem.id)
      out.push(problem)
      if (out.length >= MAX_PROBLEMS) break
    }
  }
  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
    const fa = a.file ?? ''
    const fb = b.file ?? ''
    if (fa !== fb) return fa < fb ? -1 : 1
    return (a.line ?? 0) - (b.line ?? 0)
  })
}

export function countProblems(list: Problem[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const p of list) {
    if (p.severity === 'error') errors += 1
    else warnings += 1
  }
  return { errors, warnings }
}

/** Lo que el editor puede subrayar del archivo abierto: solo lo que tiene línea. */
export function marksForFile(list: Problem[], fileName: string): EditorMarkLike[] {
  return list
    .filter((p) => p.file === fileName && p.line != null)
    .map((p) => ({ line: p.line as number, severity: p.severity, message: p.message }))
}
