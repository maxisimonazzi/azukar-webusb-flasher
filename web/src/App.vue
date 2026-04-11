<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import VerilogEditor from '@/components/VerilogEditor.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { FLASH_CONSOLE_BYTES, formatHexDump, toIntelHex } from '@/fpga/flashDump'
import { trimIce40Image } from '@/fpga/flashPlan'
import {
  closeMpsseSession,
  connectMpsse,
  disconnectMpsse,
  eraseIce40Flash,
  onMpsseConnectionChange,
  programIce40Flash,
  readFtdiConfigEeprom,
  readIce40Flash,
  resetIce40FromFlash,
} from '@/fpga/programmer'
import { BLINKY_TOP, BLINKY_VERILOG } from '@/fpga/starter'
import {
  EDITOR_FONT_DEFAULT,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  clampEditorFontSize,
} from '@/prefs/editorFont'
import { beginThemeTransition, setThemePreference, themeRef } from '@/prefs/theme'
import type { AppTheme } from '@/prefs/types'

type DumpDest = 'console' | 'bin' | 'hex'
type UsbAction = 'connect' | 'disconnect' | 'program' | 'erase' | 'reset' | 'read' | 'eeprom'

const isDark = computed(() => themeRef.value === 'dark')
const source = ref(BLINKY_VERILOG)
const top = ref(BLINKY_TOP)
const bin = shallowRef<Uint8Array | null>(null)
const logText = ref('')
const error = ref('')
const usbAction = ref<UsbAction | null>(null)
const boardConnected = ref(false)
const uploadThen = ref<'flash' | null>(null)
const progressDone = ref(0)
const progressTotal = ref(0)
const progressLabel = ref('')
const showNoBin = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const logEl = ref<HTMLElement | null>(null)
const editorFontPx = ref(EDITOR_FONT_DEFAULT)
const binObjectUrl = ref<string | null>(null)
let stopConnectionWatch: (() => void) | null = null
let logRaf: number | null = null
const logPending: string[] = []

const slimBtn = '!h-[25px] min-h-[25px] px-2 text-xs rounded-md'
const usbBusy = computed(() => usbAction.value != null)
const hasBin = computed(() => bin.value != null && bin.value.length > 0)
const progressPct = computed(() => {
  if (progressTotal.value <= 0) return 0
  return Math.min(100, Math.round((progressDone.value / progressTotal.value) * 100))
})
const showProgress = computed(
  () => usbAction.value === 'program' || usbAction.value === 'read',
)
const lineCount = computed(() => {
  if (!source.value) return 0
  return source.value.split('\n').length
})

function onTheme(next: AppTheme) {
  if (themeRef.value === next) return
  beginThemeTransition()
  setThemePreference(next)
}

function bumpFont(delta: number) {
  editorFontPx.value = clampEditorFontSize(editorFontPx.value + delta)
}

function flushLog() {
  logRaf = null
  if (logPending.length === 0) return
  const add = logPending.splice(0).join('\n')
  let next = logText.value ? `${logText.value}\n${add}` : add
  if (next.length > 200_000) next = next.slice(-160_000)
  logText.value = next
}

function appendLog(line: string) {
  logPending.push(line)
  if (logRaf == null) logRaf = requestAnimationFrame(flushLog)
}

function clearLog() {
  logPending.length = 0
  logText.value = ''
}

function setBin(next: Uint8Array) {
  bin.value = markRaw(next)
  if (binObjectUrl.value) URL.revokeObjectURL(binObjectUrl.value)
  binObjectUrl.value = URL.createObjectURL(new Blob([next], { type: 'application/octet-stream' }))
}

function onProgress(done: number, total: number, phase: string) {
  progressDone.value = done
  progressTotal.value = total
  progressLabel.value = phase
}

watch(logText, async () => {
  await nextTick()
  const el = logEl.value
  if (el) el.scrollTop = el.scrollHeight
})

function closeDetails(ev: Event) {
  const details = (ev.currentTarget as HTMLElement).closest('details')
  if (details) details.open = false
}

function needWebUsb(): boolean {
  if (navigator.usb) return true
  error.value = 'WebUSB vive en Chrome/Edge (no Firefox). localhost o HTTPS.'
  return false
}

function usbCatch(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('No device selected') || msg.toLowerCase().includes('cancel')) {
    appendLog('No se eligió ningún dispositivo USB.')
    return
  }
  error.value = msg
  appendLog(`Falló ${label}: ${msg}`)
}

function downloadNamed(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function runUsb(action: UsbAction, fn: () => Promise<void>) {
  if (!needWebUsb()) return
  usbAction.value = action
  progressDone.value = 0
  progressTotal.value = 0
  progressLabel.value = action
  try {
    await fn()
  } catch (err) {
    usbCatch(action, err)
  } finally {
    usbAction.value = null
    progressTotal.value = 0
  }
}

async function doProgram() {
  if (!bin.value) return
  showNoBin.value = false
  await runUsb('program', () =>
    programIce40Flash(bin.value!, appendLog, onProgress).then(() => undefined),
  )
}

function onFlashCompiled(ev?: Event) {
  if (ev) closeDetails(ev)
  error.value = ''
  if (!bin.value) {
    showNoBin.value = true
    return
  }
  void doProgram()
}

function onFlashUpload(ev: Event) {
  closeDetails(ev)
  error.value = ''
  uploadThen.value = 'flash'
  fileInput.value?.click()
}

async function onReset() {
  error.value = ''
  await runUsb('reset', async () => {
    appendLog('[mpsse] reset de configuración (pulso CRESET, recarga flash)')
    await resetIce40FromFlash(appendLog)
  })
}

async function onErase() {
  error.value = ''
  if (!window.confirm('Esto borra toda la flash. El diseño se pierde hasta que vuelvas a Grabar. ¿Seguro?')) {
    return
  }
  await runUsb('erase', () => eraseIce40Flash(appendLog))
}

async function onReadFlash(dest: DumpDest, ev: Event) {
  closeDetails(ev)
  error.value = ''
  await runUsb('read', async () => {
    const dump = await readIce40Flash(appendLog, onProgress)
    if (dest === 'console') {
      const preview = dump.subarray(0, Math.min(FLASH_CONSOLE_BYTES, dump.length))
      appendLog(formatHexDump(preview))
      if (dump.length > FLASH_CONSOLE_BYTES) {
        appendLog(`… consola: primeros ${FLASH_CONSOLE_BYTES} B de ${dump.length}.`)
      }
      return
    }
    if (dest === 'bin') {
      const payload = trimIce40Image(dump)
      if (payload.length === 0) {
        appendLog('Flash vacía (todo 0xFF). No bajo un .bin: no hay bitstream para re-grabar.')
        return
      }
      downloadNamed('azukar-flash.bin', new Blob([payload], { type: 'application/octet-stream' }))
      const note =
        payload.length !== dump.length
          ? ` (recorté ${dump.length} → ${payload.length} B, sin 0xFF de padding)`
          : ''
      appendLog(`Bajé azukar-flash.bin (${payload.length} B)${note}. Ese es el que re-subís.`)
      return
    }
    downloadNamed('azukar-flash.hex', new Blob([toIntelHex(dump)], { type: 'text/plain' }))
    appendLog(`Bajé azukar-flash.hex (Intel HEX del chip entero, ${dump.length} B).`)
  })
}

async function onConnect() {
  error.value = ''
  appendLog('[mpsse] Conectar: elegí la placa en el picker (no reuso la última)')
  await runUsb('connect', () => connectMpsse(appendLog, { forcePicker: true }))
}

async function onReadEeprom(dest: DumpDest, ev: Event) {
  closeDetails(ev)
  error.value = ''
  await runUsb('eeprom', async () => {
    const raw = await readFtdiConfigEeprom(appendLog)
    if (dest === 'console') return
    if (dest === 'bin') {
      downloadNamed('azukar-ftdi-eeprom.bin', new Blob([raw], { type: 'application/octet-stream' }))
      appendLog(`Bajé azukar-ftdi-eeprom.bin (${raw.length} B).`)
      return
    }
    downloadNamed('azukar-ftdi-eeprom.hex', new Blob([toIntelHex(raw)], { type: 'text/plain' }))
    appendLog('Bajé azukar-ftdi-eeprom.hex.')
  })
}

function onDownloadBin() {
  if (!bin.value || !binObjectUrl.value) return
  const a = document.createElement('a')
  a.href = binObjectUrl.value
  a.download = 'azukar.bin'
  a.click()
}

async function onDisconnect() {
  error.value = ''
  await runUsb('disconnect', () => disconnectMpsse(appendLog))
}

function onChooseUpload() {
  showNoBin.value = false
  uploadThen.value = null
  fileInput.value?.click()
}

function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void file.arrayBuffer().then((buf) => {
    const raw = new Uint8Array(buf)
    const next = trimIce40Image(raw)
    if (next.length === 0) {
      appendLog(`Cargado ${file.name} pero está vacío o es flash borrada (todo 0xFF).`)
      uploadThen.value = null
      return
    }
    setBin(next)
    if (next.length !== raw.length) {
      appendLog(`Cargado ${file.name}: recorté ${raw.length} → ${next.length} B (padding 0xFF).`)
    } else {
      appendLog(`Cargado ${file.name} (${next.length} bytes).`)
    }
    const nextAction = uploadThen.value
    uploadThen.value = null
    if (nextAction === 'flash') void doProgram()
  })
}

onMounted(() => {
  stopConnectionWatch = onMpsseConnectionChange((open) => {
    boardConnected.value = open
  })
})

onBeforeUnmount(() => {
  stopConnectionWatch?.()
  if (logRaf != null) cancelAnimationFrame(logRaf)
  if (binObjectUrl.value) URL.revokeObjectURL(binObjectUrl.value)
  void closeMpsseSession()
})
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col">
    <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
      <div class="flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="h-7 w-7" width="28" height="28">
        <h1 class="text-sm font-semibold tracking-wide text-fg">Azukar WebUSB Flasher</h1>
      </div>
      <button
        type="button"
        class="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3"
        @click="onTheme(isDark ? 'light' : 'dark')"
      >
        {{ isDark ? 'Claro' : 'Oscuro' }}
      </button>
    </header>

    <div class="flex min-h-0 flex-1 gap-4 px-4 py-3">
      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div class="flex shrink-0 items-center gap-3 border-b border-border bg-surface-2 px-3 py-1.5">
          <label class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase" for="fpga-top">
            Módulo top
          </label>
          <input
            id="fpga-top"
            v-model="top"
            class="w-40 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs"
          >
          <span class="ml-auto text-sm font-semibold text-fg">{{ lineCount }} líneas</span>
          <div class="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1">
            <button
              type="button"
              class="cursor-pointer rounded px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
              :disabled="editorFontPx <= EDITOR_FONT_MIN"
              @click="bumpFont(-1)"
            >
              A−
            </button>
            <span class="min-w-[2rem] text-center text-sm font-semibold text-fg">{{ editorFontPx }}</span>
            <button
              type="button"
              class="cursor-pointer rounded px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
              :disabled="editorFontPx >= EDITOR_FONT_MAX"
              @click="bumpFont(1)"
            >
              A+
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 p-2">
          <VerilogEditor
            v-model="source"
            :font-size="editorFontPx"
            height-class="h-full min-h-0"
          />
        </div>
      </section>

      <section class="flex min-h-0 min-w-0 w-[calc(35%+50px)] shrink-0 flex-col gap-2">
        <p v-if="error" class="shrink-0 text-sm text-error">{{ error }}</p>
        <input
          ref="fileInput"
          type="file"
          accept=".bin,application/octet-stream"
          class="hidden"
          @change="onFile"
        >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div class="shrink-0 border-b border-border px-2 py-1.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :class="boardConnected ? 'bg-success' : 'bg-error'"
                :title="boardConnected ? 'Programador (canal A) conectado' : 'Programador (canal A) desconectado'"
                aria-hidden="true"
              />
              <p class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">Grabación</p>
              <AppButton
                size="sm"
                :class="slimBtn"
                :disabled="usbBusy || boardConnected"
                title="WebUSB canal A (MPSSE)."
                @click="onConnect"
              >
                {{ usbAction === 'connect' ? 'Conectando…' : 'Conectar programador' }}
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                :class="slimBtn"
                :disabled="usbBusy || !boardConnected"
                @click="onDisconnect"
              >
                {{ usbAction === 'disconnect' ? 'Cerrando…' : 'Desconectar' }}
              </AppButton>
              <button
                type="button"
                class="ml-auto text-xs font-semibold text-muted hover:text-fg disabled:opacity-30"
                :disabled="!logText"
                @click="clearLog"
              >
                Limpiar consola
              </button>
            </div>
            <div class="mt-1.5 flex flex-nowrap items-center gap-1.5">
              <AppButton
                size="sm"
                variant="outline"
                :class="slimBtn"
                :disabled="!hasBin"
                title="Bitstream que subiste, no la EEPROM"
                @click="onDownloadBin"
              >
                Descargar .bin
              </AppButton>
              <details class="relative">
                <summary
                  class="inline-flex h-[25px] cursor-pointer list-none items-center rounded-md border border-border bg-surface-2 px-2 text-xs font-semibold text-fg hover:bg-surface-3 [&::-webkit-details-marker]:hidden"
                  :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                >
                  {{ usbAction === 'program' ? 'Grabando…' : 'Grabar en flash' }}
                </summary>
                <div class="absolute z-20 mt-1 min-w-[15rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
                    @click="onFlashCompiled"
                  >
                    Grabar bin cargado
                  </button>
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
                    @click="onFlashUpload"
                  >
                    Subir un bin
                  </button>
                </div>
              </details>
              <AppButton size="sm" variant="outline" :class="slimBtn" :disabled="usbBusy" @click="onErase">
                {{ usbAction === 'erase' ? 'Borrando…' : 'Borrar Flash' }}
              </AppButton>
              <details class="relative">
                <summary
                  class="inline-flex h-[25px] cursor-pointer list-none items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
                  :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                >
                  {{ usbAction === 'read' ? 'Leyendo…' : 'Leer Flash' }}
                </summary>
                <div class="absolute z-20 mt-1 min-w-[14rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
                  <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadFlash('bin', $event)">Leer y bajar bin</button>
                  <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadFlash('hex', $event)">Leer y bajar hex</button>
                  <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadFlash('console', $event)">Leer y mostrar por consola</button>
                </div>
              </details>
              <AppButton size="sm" variant="outline" :class="slimBtn" :disabled="usbBusy" @click="onReset">
                {{ usbAction === 'reset' ? 'Reseteando…' : 'Reset' }}
              </AppButton>
              <details class="relative">
                <summary
                  class="inline-flex h-[25px] cursor-pointer list-none items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
                  :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                  title="Lee la EEPROM chica del FTDI, no la flash SPI"
                >
                  {{ usbAction === 'eeprom' ? 'EEPROM…' : 'Leer EEPROM' }}
                </summary>
                <div class="absolute z-20 mt-1 min-w-[14rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
                  <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadEeprom('bin', $event)">Leer y bajar bin</button>
                  <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadEeprom('hex', $event)">Leer y bajar hex</button>
                  <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadEeprom('console', $event)">Leer y mostrar por consola</button>
                </div>
              </details>
            </div>
            <div v-if="showProgress" class="mt-1.5">
              <div class="mb-1 flex justify-between text-xs text-muted">
                <span>{{ progressLabel }}</span>
                <span>{{ progressPct }}%</span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div class="h-full bg-primary transition-[width] duration-75" :style="{ width: `${progressPct}%` }" />
              </div>
            </div>
          </div>
          <div ref="logEl" class="min-h-0 flex-1 overflow-y-auto">
            <pre class="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">{{
              logText || 'Log de timings del grabado (canal A / WebUSB). Todavía no hay compile.'
            }}</pre>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="showNoBin"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
    >
      <div class="max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
        <p class="text-sm text-fg">No hay .bin. Subí uno para grabar la flash.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton variant="secondary" @click="onChooseUpload">Subir .bin</AppButton>
          <AppButton variant="outline" @click="showNoBin = false">Cancelar</AppButton>
        </div>
      </div>
    </div>
  </div>
</template>
