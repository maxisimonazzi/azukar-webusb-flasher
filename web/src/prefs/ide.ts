/**
 * Interruptores del modo IDE (revisión automática, verificar después de grabar,
 * vista de la consola UART). Viven en `localStorage`, como el resto de las
 * preferencias: no hay servidor donde guardarlos.
 */
import { ref, watch } from 'vue'

import { readLocal, writeLocal } from '@/lib/storage'

const AUTO_CHECK_KEY = 'autoCheck'
const AUTO_VERIFY_KEY = 'autoVerify'
const UART_TIMESTAMPS_KEY = 'uartTimestamps'
const UART_HEX_KEY = 'uartHex'

function readFlag(key: string, fallback: boolean): boolean {
  const raw = readLocal(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return fallback
}

function persist(key: string, value: boolean): void {
  writeLocal(key, value ? '1' : '0')
}

/** Revisión rápida al dejar de escribir. Arranca en on: cuesta segundos. */
export const autoCheckRef = ref<boolean>(readFlag(AUTO_CHECK_KEY, true))
/** Releer la flash y comparar apenas termina de grabar. */
export const autoVerifyRef = ref<boolean>(readFlag(AUTO_VERIFY_KEY, false))
export const uartTimestampsRef = ref<boolean>(readFlag(UART_TIMESTAMPS_KEY, false))
export const uartHexRef = ref<boolean>(readFlag(UART_HEX_KEY, false))

watch(autoCheckRef, (v) => persist(AUTO_CHECK_KEY, v))
watch(autoVerifyRef, (v) => persist(AUTO_VERIFY_KEY, v))
watch(uartTimestampsRef, (v) => persist(UART_TIMESTAMPS_KEY, v))
watch(uartHexRef, (v) => persist(UART_HEX_KEY, v))
