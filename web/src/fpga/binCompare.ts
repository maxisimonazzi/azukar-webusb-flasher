/**
 * Verificar después de grabar: se relee de la flash lo mismo que se escribió y
 * se compara byte a byte. Sin esto, "grabé" es una suposición.
 */

export type BinDiff = {
  equal: boolean
  /** Offset del primer byte distinto, o `null` si son iguales. */
  firstDiff: number | null
  /** Cuántos bytes se pudieron comparar. */
  compared: number
  /** Bytes que faltaron en la lectura (dump más corto que el bitstream). */
  missing: number
  expectedByte: number | null
  actualByte: number | null
}

export function compareBins(expected: Uint8Array, actual: Uint8Array): BinDiff {
  const compared = Math.min(expected.length, actual.length)
  const missing = Math.max(0, expected.length - actual.length)
  for (let i = 0; i < compared; i += 1) {
    if (expected[i] !== actual[i]) {
      return {
        equal: false,
        firstDiff: i,
        compared,
        missing,
        expectedByte: expected[i] ?? null,
        actualByte: actual[i] ?? null,
      }
    }
  }
  if (missing > 0) {
    return {
      equal: false,
      firstDiff: compared,
      compared,
      missing,
      expectedByte: expected[compared] ?? null,
      actualByte: null,
    }
  }
  return {
    equal: true,
    firstDiff: null,
    compared,
    missing: 0,
    expectedByte: null,
    actualByte: null,
  }
}

export function hex(value: number, digits = 2): string {
  return value.toString(16).toUpperCase().padStart(digits, '0')
}

/** Una línea para la consola, que es donde el usuario mira el resultado. */
export function describeDiff(diff: BinDiff): string {
  if (diff.equal) return `verificado: ${diff.compared} bytes iguales`
  if (diff.actualByte == null) {
    return `no coincide: la lectura terminó en ${diff.compared} bytes y faltan ${diff.missing}`
  }
  return (
    `no coincide en 0x${hex(diff.firstDiff ?? 0, 6)}: ` +
    `esperaba 0x${hex(diff.expectedByte ?? 0)} y leí 0x${hex(diff.actualByte)}`
  )
}
