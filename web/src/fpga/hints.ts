/**
 * Los mensajes de Yosys y nextpnr son correctos y crípticos. Acá viven las
 * traducciones a "qué te pasó y qué hacer", para los casos que se repiten.
 *
 * Los textos son los que escribe Yosys 0.68 / nextpnr-ice40 0.11, verificados
 * corriendo la toolchain, no de memoria.
 */

export type HintKey =
  | 'latch'
  | 'latch-check'
  | 'no-driver'
  | 'implicit'
  | 'missing-module'
  | 'unconstrained'
  | 'freq-ignored'
  | 'multiple-drivers'

export type Hint = {
  key: HintKey
  /** Señal o módulo del que habla el mensaje, si se puede sacar. */
  subject: string | null
}

/** `\top.\q` → `q`; `\uart_tx` → `uart_tx`. */
function cleanId(raw: string | undefined): string | null {
  if (!raw) return null
  const parts = raw.split('.')
  const last = parts[parts.length - 1] ?? raw
  const clean = last.replace(/^[\\]+/, '').replace(/['`]/g, '').trim()
  return clean || null
}

const RULES: { key: HintKey; re: RegExp }[] = [
  // Warning: Latch inferred for signal `\top.\q' from process `\top.$proc$...'
  { key: 'latch', re: /Latch inferred for signal\s+[`']?([^\s']+)/ },
  // ERROR: Found 1 problems in 'check -assert'  (en iCE40, casi siempre el latch)
  { key: 'latch-check', re: /Found \d+ problems? in 'check -assert'/ },
  // Warning: Wire top.\suelta is used but has no driver.
  { key: 'no-driver', re: /Wire\s+([^\s]+)\s+is used but has no driver/ },
  // top.v:3: Warning: Identifier `\no_declarada' is implicitly declared.
  { key: 'implicit', re: /Identifier\s+[`']?([^\s']+)['`]?\s+is implicitly declared/ },
  // ERROR: Module `\falta' referenced in module `\top' in cell `\u0' is not part of the design.
  { key: 'missing-module', re: /Module\s+[`']?([^\s']+)['`]?\s+referenced in module[^]*not part of the design/ },
  // ERROR: IO 'LED7' is unconstrained in PCF
  { key: 'unconstrained', re: /IO\s+'([^']+)'\s+is unconstrained in PCF/ },
  // Warning: net 'CLK100' does not exist in design, ignoring clock constraint
  { key: 'freq-ignored', re: /net\s+'([^']+)'\s+does not exist in design, ignoring clock constraint/ },
  { key: 'multiple-drivers', re: /Multiple drivers?\s+for\s+([^\s]+)/i },
]

/** El primer patrón que matchea, con el nombre que aparece en el mensaje. */
export function findHint(message: string): Hint | null {
  for (const rule of RULES) {
    const match = rule.re.exec(message)
    if (!match) continue
    return { key: rule.key, subject: cleanId(match[1]) }
  }
  return null
}

/**
 * Texto en castellano para cada caso. Se devuelve armado acá (y no por i18n)
 * para poder probarlo sin montar vue-i18n; la UI lo muestra tal cual.
 */
export function hintText(hint: Hint): string {
  const who = hint.subject ? `\`${hint.subject}\`` : 'esa señal'
  switch (hint.key) {
    case 'latch':
      return (
        `Se infirió un latch en ${who}: hay un camino del \`always @(*)\` donde no ` +
        'recibe valor. Poné un valor por defecto antes del `if`/`case`, o completá ' +
        'el `else`/`default`. En iCE40 no hay latches: Yosys lo arma con realimentación ' +
        'de LUT y la síntesis suele terminar cortando.'
      )
    case 'latch-check':
      return (
        'La verificación final de Yosys encontró un problema estructural. En iCE40 casi ' +
        'siempre es un latch inferido (buscá el aviso "Latch inferred" más arriba) o un ' +
        'lazo combinacional: una señal que depende de sí misma sin pasar por un flip-flop.'
      )
    case 'no-driver':
      return (
        `${who} se usa pero nadie la maneja: quedó sin \`assign\`, sin salida de un ` +
        'módulo, o el nombre no coincide con el que la genera.'
      )
    case 'implicit':
      return (
        `${who} no está declarada. Verilog la crea sola como \`wire\` de 1 bit, así que ` +
        'esto suele ser un error de tipeo o un `reg`/`wire` que falta.'
      )
    case 'missing-module':
      return (
        `No existe el módulo ${who}. Falta el archivo en el proyecto, o el nombre de la ` +
        'instancia no coincide con el del `module`.'
      )
    case 'unconstrained':
      return (
        `${who} es un puerto del top sin \`set_io\` en el \`.pcf\`. nextpnr no adivina en ` +
        'qué pin va: agregalo o sacalo de los puertos del módulo.'
      )
    case 'freq-ignored':
      return (
        `Hay un \`set_frequency\` para ${who}, pero tu diseño no usa ese reloj. La línea no ` +
        'molesta; si esperabas usarlo, fijate que la señal llegue a algún `always`.'
      )
    case 'multiple-drivers':
      return (
        `${who} tiene más de una cosa manejándola. En hardware eso es un cortocircuito: ` +
        'dejá un solo `assign` o un solo bloque que la escriba.'
      )
    default: {
      const _exhaustive: never = hint.key
      return _exhaustive
    }
  }
}

export function explainMessage(message: string): string | null {
  const hint = findHint(message)
  return hint ? hintText(hint) : null
}
