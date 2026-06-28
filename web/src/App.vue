<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import VerilogEditor from '@/components/VerilogEditor.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { compileFpga } from '@/fpga/compile'
import {
  addFpgaFile,
  closeFpgaTab,
  deleteFpgaFile,
  openFpgaTab,
  visibleFpgaTabs,
  type FpgaFile,
} from '@/fpga/files'
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
import { BLINKY_TOP, FPGA_STARTER } from '@/fpga/starter'
import {
  UART_BAUD_DEFAULT,
  UART_BAUDS,
  appendUartText,
  hasWebSerial,
  openUartSession,
  type UartSession,
} from '@/fpga/uart'
import { verilogFilesFromZip, verilogFilesToZip } from '@/fpga/zipVerilog'
import { isFirefox } from '@/lib/isFirefox'
import {
  EDITOR_FONT_DEFAULT,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  clampEditorFontSize,
} from '@/prefs/editorFont'
import { setLocalePreference } from '@/prefs/locale'
import { beginThemeTransition, setThemePreference, themeRef } from '@/prefs/theme'
import { FIREFOX_NOTICE_KEY, type AppLocale, type AppTheme } from '@/prefs/types'

type DumpDest = 'console' | 'bin' | 'hex'
type UsbAction = 'connect' | 'disconnect' | 'program' | 'erase' | 'reset' | 'read' | 'eeprom'

const { t, locale } = useI18n()

const isDark = computed(() => themeRef.value === 'dark')
const files = ref<FpgaFile[]>(FPGA_STARTER.map((f) => ({ ...f })))
const activeName = ref(FPGA_STARTER[0]?.name ?? 'azukar_lab.v')
const top = ref(BLINKY_TOP)
const bin = shallowRef<Uint8Array | null>(null)
const logText = ref('')
const error = ref('')
const busyCompile = ref(false)
const usbAction = ref<UsbAction | null>(null)
const boardConnected = ref(false)
const uploadThen = ref<'flash' | null>(null)
const progressDone = ref(0)
const progressTotal = ref(0)
const progressLabel = ref('')
const showNoBin = ref(false)
const showFirefoxNotice = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const zipInput = ref<HTMLInputElement | null>(null)
const logEl = ref<HTMLElement | null>(null)
const uartEl = ref<HTMLElement | null>(null)
const uartText = ref('')
const uartConnected = ref(false)
const uartBusy = ref(false)
const uartBaud = ref<(typeof UART_BAUDS)[number]>(UART_BAUD_DEFAULT)
let uartSession: UartSession | null = null
const uartPending: string[] = []
let uartRaf: number | null = null
const editorFontPx = ref(EDITOR_FONT_DEFAULT)
const binObjectUrl = ref<string | null>(null)
let stopConnectionWatch: (() => void) | null = null
let logRaf: number | null = null
const logPending: string[] = []

const slimBtn = '!h-[25px] min-h-[25px] px-2 text-xs rounded-md'
const usbBusy = computed(() => usbAction.value != null)
const uiLocked = computed(() => busyCompile.value)
const hasBin = computed(() => bin.value != null && bin.value.length > 0)
const progressPct = computed(() => {
  if (progressTotal.value <= 0) return 0
  return Math.min(100, Math.round((progressDone.value / progressTotal.value) * 100))
})
const showProgress = computed(
  () => usbAction.value === 'program' || usbAction.value === 'read',
)
const openTabs = computed(() => visibleFpgaTabs(files.value))
const activeFile = computed(
  () => files.value.find((f) => f.name === activeName.value && f.open) ?? null,
)
const lineCount = computed(() => {
  const text = activeFile.value?.content ?? ''
  if (!text) return 0
  return text.split('\n').length
})

const lineCountLabel = computed(() => t('editor.lineCount', { n: lineCount.value }))

function onTheme(next: AppTheme) {
  if (themeRef.value === next) return
  beginThemeTransition()
  setThemePreference(next)
}

function toggleTheme() {
  onTheme(isDark.value ? 'light' : 'dark')
}

function localeBtnClass(code: AppLocale): string {
  const active = locale.value === code
  return [
    'cursor-pointer rounded-md px-2 py-1 text-xs font-semibold tracking-wide transition-colors',
    active
      ? 'bg-primary/15 text-primary'
      : 'text-muted hover:bg-surface-2 hover:text-fg',
  ].join(' ')
}

function dismissFirefoxNotice() {
  showFirefoxNotice.value = false
  try {
    localStorage.setItem(FIREFOX_NOTICE_KEY, '1')
  } catch {
    /* private mode */
  }
}

function onLocale(next: AppLocale) {
  if (locale.value === next) return
  setLocalePreference(next)
  locale.value = next
  document.documentElement.lang = next
}

function bumpFont(delta: number) {
  editorFontPx.value = clampEditorFontSize(editorFontPx.value + delta)
}

function setActiveContent(content: string) {
  files.value = files.value.map((f) =>
    f.name === activeName.value ? { ...f, content } : f,
  )
}

function onOpenFile(name: string) {
  files.value = openFpgaTab(files.value, name)
  activeName.value = name
}

function onCloseTab(name: string) {
  files.value = closeFpgaTab(files.value, name)
  if (activeName.value !== name) return
  const next = visibleFpgaTabs(files.value)[0]
  activeName.value = next?.name ?? ''
}

function onAddFile() {
  const next = addFpgaFile(files.value)
  if (next.length === files.value.length) return
  files.value = next
  const added = next[next.length - 1]
  if (added) activeName.value = added.name
}

function onDeleteFile(name: string) {
  if (files.value.length <= 1) return
  const next = deleteFpgaFile(files.value, name)
  files.value = next
  if (activeName.value === name) {
    const open = visibleFpgaTabs(next)[0]
    activeName.value = open?.name ?? next[0]?.name ?? ''
  }
}

function onImportZip() {
  zipInput.value?.click()
}

function onExportZip() {
  const zip = verilogFilesToZip(files.value.map((f) => ({ name: f.name, content: f.content })))
  downloadNamed('azukar-proyecto.zip', new Blob([zip], { type: 'application/zip' }))
}

async function onZipFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const imported = await verilogFilesFromZip(await file.arrayBuffer())
    if (imported.length === 0) {
      error.value = t('fpga.zipNoVerilog')
      return
    }
    files.value = imported.map((f) => ({ ...f, open: true }))
    activeName.value = files.value[0]?.name ?? ''
    appendLog(t('fpga.zipImported', { n: imported.length, name: file.name }))
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('fpga.zipReadFailed')
  }
}

function flushUart() {
  uartRaf = null
  if (uartPending.length === 0) return
  uartText.value = appendUartText(uartText.value, uartPending.splice(0).join(''))
}

function onUartChunk(chunk: string) {
  uartPending.push(chunk)
  if (uartRaf == null) uartRaf = requestAnimationFrame(flushUart)
}

function clearUart() {
  uartPending.length = 0
  uartText.value = ''
}

async function onUartConnect() {
  error.value = ''
  if (!hasWebSerial()) {
    error.value = t('fpga.needWebSerial')
    return
  }
  uartBusy.value = true
  try {
    uartSession = await openUartSession({
      baudRate: uartBaud.value,
      onText: onUartChunk,
      onDisconnect: () => {
        uartConnected.value = false
        uartSession = null
      },
    })
    uartConnected.value = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('No port selected') || msg.toLowerCase().includes('cancel')) return
    error.value = uartErrorMessage(err)
  } finally {
    uartBusy.value = false
  }
}

async function onUartDisconnect() {
  uartBusy.value = true
  try {
    await uartSession?.close()
  } finally {
    uartSession = null
    uartConnected.value = false
    uartBusy.value = false
  }
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

function clipLog(text: string, maxChars = 40_000): string {
  if (text.length <= maxChars) return text
  return `${t('fpga.logTrimmed', { n: maxChars })}\n${text.slice(-maxChars)}`
}

type CompileFailCode = 'COMPILE_BUSY' | 'COMPILE_TOO_LARGE'
type UartFailCode = 'NEED_WEB_SERIAL' | 'UART_NO_READABLE'

function isCompileFailCode(msg: string): msg is CompileFailCode {
  return msg === 'COMPILE_BUSY' || msg === 'COMPILE_TOO_LARGE'
}

function isUartFailCode(msg: string): msg is UartFailCode {
  return msg === 'NEED_WEB_SERIAL' || msg === 'UART_NO_READABLE'
}

function compileErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (!isCompileFailCode(msg)) return msg || t('fpga.compileFailed')
  switch (msg) {
    case 'COMPILE_BUSY':
      return t('fpga.compileBusy')
    case 'COMPILE_TOO_LARGE':
      return t('fpga.compileTooLarge')
    default: {
      const _exhaustive: never = msg
      return _exhaustive
    }
  }
}

function uartErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (!isUartFailCode(msg)) return msg
  switch (msg) {
    case 'NEED_WEB_SERIAL':
      return t('fpga.needWebSerial')
    case 'UART_NO_READABLE':
      return t('fpga.uartNoReadable')
    default: {
      const _exhaustive: never = msg
      return _exhaustive
    }
  }
}

function progressPhrase(phase: string): string {
  switch (phase) {
    case 'flash':
    case 'program':
      return t('fpga.flashing')
    case 'read':
      return t('fpga.reading')
    default:
      return phase
  }
}

async function onCompile() {
  error.value = ''
  showNoBin.value = false
  if (busyCompile.value) return
  busyCompile.value = true
  appendLog(t('fpga.compileQueued'))
  try {
    const result = await compileFpga(
      files.value.map((f) => ({ name: f.name, content: f.content })),
      top.value.trim() || BLINKY_TOP,
    )
    if (result.log) appendLog(clipLog(result.log))
    if (result.status === 'success' && result.bin) {
      setBin(result.bin)
      appendLog(t('fpga.binReady', { n: result.bin.length }))
    } else if (result.status !== 'success') {
      error.value = t('fpga.compileNoBin')
    }
  } catch (err) {
    error.value = compileErrorMessage(err)
  } finally {
    busyCompile.value = false
  }
}

function onProgress(done: number, total: number, phase: string) {
  progressDone.value = done
  progressTotal.value = total
  progressLabel.value = progressPhrase(phase)
}

watch(logText, async () => {
  await nextTick()
  const el = logEl.value
  if (el) el.scrollTop = el.scrollHeight
})

watch(uartText, async () => {
  await nextTick()
  const el = uartEl.value
  if (el) el.scrollTop = el.scrollHeight
})

function closeDetails(ev: Event) {
  const details = (ev.currentTarget as HTMLElement).closest('details')
  if (details) details.open = false
}

function needWebUsb(): boolean {
  if (navigator.usb) return true
  error.value = t('fpga.needWebUsb')
  return false
}

function usbCatch(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('No device selected') || msg.toLowerCase().includes('cancel')) {
    appendLog(t('fpga.noUsbDevice'))
    return
  }
  error.value = msg
  appendLog(t('fpga.usbFailed', { label, msg }))
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
  progressLabel.value = progressPhrase(action)
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
  clearUart()
  await runUsb('reset', async () => {
    appendLog(t('fpga.resetLog'))
    await resetIce40FromFlash(appendLog)
  })
}

async function onErase() {
  error.value = ''
  if (!window.confirm(t('fpga.eraseConfirm'))) {
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
        appendLog(t('fpga.consolePreview', { n: FLASH_CONSOLE_BYTES, total: dump.length }))
      }
      return
    }
    if (dest === 'bin') {
      const payload = trimIce40Image(dump)
      if (payload.length === 0) {
        appendLog(t('fpga.flashEmpty'))
        return
      }
      downloadNamed('azukar-flash.bin', new Blob([payload], { type: 'application/octet-stream' }))
      const note =
        payload.length !== dump.length
          ? t('fpga.flashBinTrimNote', { from: dump.length, to: payload.length })
          : ''
      appendLog(t('fpga.flashBinSaved', { n: payload.length, note }))
      return
    }
    downloadNamed('azukar-flash.hex', new Blob([toIntelHex(dump)], { type: 'text/plain' }))
    appendLog(t('fpga.flashHexSaved', { n: dump.length }))
  })
}

async function onConnect() {
  error.value = ''
  appendLog(t('fpga.connectPicker'))
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
      appendLog(t('fpga.eepromBinSaved', { n: raw.length }))
      return
    }
    downloadNamed('azukar-ftdi-eeprom.hex', new Blob([toIntelHex(raw)], { type: 'text/plain' }))
    appendLog(t('fpga.eepromHexSaved'))
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
      appendLog(t('fpga.uploadEmpty', { name: file.name }))
      uploadThen.value = null
      return
    }
    setBin(next)
    if (next.length !== raw.length) {
      appendLog(t('fpga.uploadTrimmed', { name: file.name, from: raw.length, to: next.length }))
    } else {
      appendLog(t('fpga.uploadOk', { name: file.name, n: next.length }))
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
  try {
    if (isFirefox() && localStorage.getItem(FIREFOX_NOTICE_KEY) !== '1') {
      showFirefoxNotice.value = true
    }
  } catch {
    if (isFirefox()) showFirefoxNotice.value = true
  }
})

onBeforeUnmount(() => {
  stopConnectionWatch?.()
  if (logRaf != null) cancelAnimationFrame(logRaf)
  if (uartRaf != null) cancelAnimationFrame(uartRaf)
  if (binObjectUrl.value) URL.revokeObjectURL(binObjectUrl.value)
  void uartSession?.close()
  void closeMpsseSession()
})
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col overflow-hidden">
    <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
      <div class="flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="h-7 w-7" width="28" height="28">
        <h1 class="text-sm font-semibold tracking-wide text-fg">{{ t('app.title') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <div
          class="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2/60 p-0.5"
          role="group"
          :aria-label="t('app.localeGroup')"
        >
          <button
            type="button"
            :class="localeBtnClass('es')"
            :aria-pressed="locale === 'es'"
            @click="onLocale('es')"
          >
            {{ t('app.localeEs') }}
          </button>
          <button
            type="button"
            :class="localeBtnClass('en')"
            :aria-pressed="locale === 'en'"
            @click="onLocale('en')"
          >
            {{ t('app.localeEn') }}
          </button>
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-primary transition-colors hover:bg-surface-2"
          :aria-label="isDark ? t('app.themeLight') : t('app.themeDark')"
          :title="isDark ? t('app.themeLight') : t('app.themeDark')"
          @click="toggleTheme"
        >
          <svg
            v-if="!isDark"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5"
            aria-hidden="true"
          >
            <path
              d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm10-8a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zM4 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zm14.95 6.364a1 1 0 0 1 0 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zM6.464 5.05a1 1 0 0 1 0 1.414l-.707.707A1 1 0 0 1 4.343 5.757l.707-.707a1 1 0 0 1 1.414 0zm12.728 0a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 1 1 1.414-1.414l.707.707a1 1 0 0 1 0 1.414zM6.464 18.95a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 1 1 1.414-1.414l.707.707a1 1 0 0 1 0 1.414z"
            />
          </svg>
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 gap-4 overflow-hidden px-4 py-3">
      <section class="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
        <aside class="flex w-[11.5rem] shrink-0 flex-col overflow-y-auto border-r border-border">
          <div class="px-2 pt-3 pb-1">
            <label class="mb-1 block text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase" for="fpga-top">
              {{ t('fpga.topModule') }}
            </label>
            <input
              id="fpga-top"
              v-model="top"
              class="w-full rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
            >
          </div>
          <div class="flex items-center gap-1 px-2 pt-2 pb-2">
            <p class="min-w-0 flex-1 px-1 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
              {{ t('fpga.files') }}
            </p>
            <button
              type="button"
              class="rounded-sm border border-dashed border-primary/60 px-1.5 py-0 text-sm font-bold text-primary hover:bg-primary/10"
              :title="t('fpga.addFile')"
              @click="onAddFile"
            >
              +
            </button>
          </div>
          <ul class="flex flex-col pb-2">
            <li v-for="f in files" :key="f.name">
              <div
                class="flex items-stretch"
                :class="f.name === activeName && f.open ? 'bg-surface-2' : ''"
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 truncate px-3 py-1.5 text-left font-mono text-sm"
                  :class="
                    f.open
                      ? f.name === activeName
                        ? 'font-semibold text-fg'
                        : 'text-fg hover:text-primary'
                      : 'text-muted hover:text-fg'
                  "
                  :title="f.name"
                  @click="onOpenFile(f.name)"
                >
                  {{ f.name }}
                </button>
                <button
                  type="button"
                  class="shrink-0 px-2 text-muted hover:text-error disabled:opacity-30"
                  :disabled="files.length <= 1"
                  :title="t('fpga.deleteFile')"
                  @click="onDeleteFile(f.name)"
                >
                  ×
                </button>
              </div>
            </li>
          </ul>
        </aside>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-2 py-0">
            <div class="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist">
              <button
                v-for="f in openTabs"
                :key="f.name"
                type="button"
                role="tab"
                :aria-selected="f.name === activeName"
                class="relative shrink-0 border-t-2 px-3 py-2 text-sm font-semibold whitespace-nowrap"
                :class="
                  f.name === activeName
                    ? 'border-primary bg-surface text-fg'
                    : 'border-transparent text-muted hover:bg-surface/60 hover:text-fg'
                "
                @click="activeName = f.name"
              >
                {{ f.name }}
                <span
                  class="ml-2 text-muted hover:text-error"
                  :title="t('fpga.closeTab')"
                  @click.stop="onCloseTab(f.name)"
                >×</span>
              </button>
              <button
                type="button"
                class="my-1 ml-1 self-center rounded-sm border border-dashed border-primary/60 px-2 py-0.5 text-sm font-bold text-primary hover:bg-primary/10"
                :title="t('fpga.addFile')"
                @click="onAddFile"
              >
                +
              </button>
            </div>
            <div class="ml-auto flex items-center gap-2 py-1 pr-1">
              <button
                type="button"
                class="cursor-pointer rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
                :title="t('fpga.importProject')"
                @click="onImportZip"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                </svg>
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
                :title="t('fpga.exportProject')"
                @click="onExportZip"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M5 20h14v-2H5v2zm7-18l-5 5h3v6h4V7h3l-5-5z" />
                </svg>
              </button>
              <span class="text-sm font-semibold text-fg">{{ lineCountLabel }}</span>
              <div class="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1">
                <button
                  type="button"
                  class="cursor-pointer rounded px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                  :disabled="editorFontPx <= EDITOR_FONT_MIN"
                  :title="t('editor.fontSmaller')"
                  @click="bumpFont(-1)"
                >
                  A−
                </button>
                <span class="min-w-[2rem] text-center text-sm font-semibold text-fg">{{ editorFontPx }}</span>
                <button
                  type="button"
                  class="cursor-pointer rounded px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                  :disabled="editorFontPx >= EDITOR_FONT_MAX"
                  :title="t('editor.fontLarger')"
                  @click="bumpFont(1)"
                >
                  A+
                </button>
              </div>
            </div>
          </div>
          <div class="min-h-0 flex-1 p-2">
            <VerilogEditor
              v-if="activeFile"
              :key="activeName"
              :model-value="activeFile.content"
              :font-size="editorFontPx"
              height-class="h-full min-h-0"
              @update:model-value="setActiveContent"
            />
            <p v-else class="p-4 text-sm text-muted">
              {{ t('fpga.noOpenTab') }}
            </p>
          </div>
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
        <input
          ref="zipInput"
          type="file"
          accept=".zip,application/zip"
          class="hidden"
          @change="onZipFile"
        >
        <div class="flex min-h-0 flex-1 flex-col gap-2">
          <div class="flex min-h-0 flex-[1.2] flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div class="shrink-0 border-b border-border px-2 py-1.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  :class="boardConnected ? 'bg-success' : 'bg-error'"
                  :title="boardConnected ? t('fpga.programmerOn') : t('fpga.programmerOff')"
                  aria-hidden="true"
                />
                <p class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">{{ t('fpga.recording') }}</p>
                <AppButton
                  size="sm"
                  :class="slimBtn"
                  :disabled="usbBusy || boardConnected"
                  :title="t('fpga.connectProgrammerHint')"
                  @click="onConnect"
                >
                  {{ usbAction === 'connect' ? t('fpga.connectingProgrammer') : t('fpga.connectProgrammer') }}
                </AppButton>
                <AppButton
                  size="sm"
                  variant="outline"
                  :class="slimBtn"
                  :disabled="usbBusy || !boardConnected"
                  :title="t('fpga.disconnectProgrammerHint')"
                  @click="onDisconnect"
                >
                  {{ usbAction === 'disconnect' ? t('fpga.closingProgrammer') : t('fpga.disconnectProgrammer') }}
                </AppButton>
                <button
                  type="button"
                  class="ml-auto text-xs font-semibold text-muted hover:text-fg disabled:opacity-30"
                  :disabled="!logText"
                  @click="clearLog"
                >
                  {{ t('fpga.clearConsole') }}
                </button>
              </div>
              <div class="mt-1.5 flex flex-nowrap items-center gap-1.5">
                <AppButton
                  size="sm"
                  :class="slimBtn"
                  :disabled="uiLocked || usbBusy"
                  @click="onCompile"
                >
                  {{ busyCompile ? t('fpga.compiling') : t('fpga.compile') }}
                </AppButton>
                <AppButton
                  size="sm"
                  variant="outline"
                  :class="slimBtn"
                  :disabled="!hasBin"
                  :title="t('fpga.downloadBinHint')"
                  @click="onDownloadBin"
                >
                  {{ t('fpga.downloadBin') }}
                </AppButton>
                <details class="relative">
                  <summary
                    class="inline-flex h-[25px] cursor-pointer list-none items-center rounded-md border border-border bg-surface-2 px-2 text-xs font-semibold text-fg hover:bg-surface-3 [&::-webkit-details-marker]:hidden"
                    :class="usbBusy || uiLocked ? 'pointer-events-none opacity-60' : ''"
                  >
                    {{ usbAction === 'program' ? t('fpga.flashing') : t('fpga.flash') }}
                  </summary>
                  <div class="absolute z-20 mt-1 min-w-[15rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
                      @click="onFlashCompiled"
                    >
                      {{ t('fpga.flashCompiled') }}
                    </button>
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
                      @click="onFlashUpload"
                    >
                      {{ t('fpga.flashUpload') }}
                    </button>
                  </div>
                </details>
                <AppButton size="sm" variant="outline" :class="slimBtn" :disabled="usbBusy" @click="onErase">
                  {{ usbAction === 'erase' ? t('fpga.erasing') : t('fpga.eraseFlash') }}
                </AppButton>
                <details class="relative">
                  <summary
                    class="inline-flex h-[25px] cursor-pointer list-none items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
                    :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                  >
                    {{ usbAction === 'read' ? t('fpga.reading') : t('fpga.readFlash') }}
                  </summary>
                  <div class="absolute z-20 mt-1 min-w-[14rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
                    <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadFlash('bin', $event)">{{ t('fpga.readDownloadBin') }}</button>
                    <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadFlash('hex', $event)">{{ t('fpga.readDownloadHex') }}</button>
                    <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadFlash('console', $event)">{{ t('fpga.readShowConsole') }}</button>
                  </div>
                </details>
                <AppButton size="sm" variant="outline" :class="slimBtn" :disabled="usbBusy" @click="onReset">
                  {{ usbAction === 'reset' ? t('fpga.resetting') : t('fpga.reset') }}
                </AppButton>
                <details class="relative">
                  <summary
                    class="inline-flex h-[25px] cursor-pointer list-none items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
                    :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                    :title="t('fpga.readEepromHint')"
                  >
                    {{ usbAction === 'eeprom' ? t('fpga.eepromBusy') : t('fpga.readEeprom') }}
                  </summary>
                  <div class="absolute z-20 mt-1 min-w-[14rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
                    <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadEeprom('bin', $event)">{{ t('fpga.readDownloadBin') }}</button>
                    <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadEeprom('hex', $event)">{{ t('fpga.readDownloadHex') }}</button>
                    <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2" @click="onReadEeprom('console', $event)">{{ t('fpga.readShowConsole') }}</button>
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
                logText || t('fpga.logEmpty')
              }}</pre>
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
              <span
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :class="uartConnected ? 'bg-success' : 'bg-error'"
                aria-hidden="true"
              />
              <p class="text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">{{ t('fpga.uart') }}</p>
              <label class="sr-only" for="fpga-uart-baud">{{ t('fpga.baud') }}</label>
              <select
                id="fpga-uart-baud"
                v-model.number="uartBaud"
                class="h-[25px] rounded-md border border-border bg-surface-2 px-1.5 font-mono text-xs"
                :disabled="uartConnected || uartBusy"
                :title="t('fpga.baudHint')"
              >
                <option v-for="n in UART_BAUDS" :key="n" :value="n">{{ n }}</option>
              </select>
              <AppButton
                size="sm"
                :class="slimBtn"
                :disabled="uartBusy || uartConnected"
                :title="t('fpga.connectUartHint')"
                @click="onUartConnect"
              >
                {{ uartBusy && !uartConnected ? t('fpga.connectingUart') : t('fpga.connectUart') }}
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                :class="slimBtn"
                :disabled="uartBusy || !uartConnected"
                :title="t('fpga.disconnectUartHint')"
                @click="onUartDisconnect"
              >
                {{ t('fpga.disconnectUart') }}
              </AppButton>
              <button
                type="button"
                class="ml-auto text-xs font-semibold text-muted hover:text-fg disabled:opacity-30"
                :disabled="!uartText"
                @click="clearUart"
              >
                {{ t('fpga.clearConsole') }}
              </button>
            </div>
            <div ref="uartEl" class="min-h-0 flex-1 overflow-y-auto">
              <pre class="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">{{
                uartText || t('fpga.uartEmpty')
              }}</pre>
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="shrink-0 border-t border-border px-4 py-1.5 text-center text-[0.6875rem] leading-relaxed text-muted">
      <span>Maximiliano Martin Simonazzi</span>
      <span class="mx-1.5 text-subtle">·</span>
      <a
        class="text-muted no-underline hover:text-fg hover:underline"
        href="https://www.maxisimonazzi.com.ar"
        target="_blank"
        rel="noopener noreferrer"
      >www.maxisimonazzi.com.ar</a>
      <span class="mx-1.5 text-subtle">·</span>
      <a
        class="text-muted no-underline hover:text-fg hover:underline"
        href="https://github.com/maxisimonazzi"
        target="_blank"
        rel="noopener noreferrer"
      >github.com/maxisimonazzi</a>
      <span class="mx-1.5 text-subtle">·</span>
      <a
        class="text-muted no-underline hover:text-fg hover:underline"
        href="https://www.linkedin.com/in/maxisimonazzi/"
        target="_blank"
        rel="noopener noreferrer"
      >linkedin.com/in/maxisimonazzi</a>
    </footer>

    <div
      v-if="showNoBin"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
    >
      <div class="max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
        <p class="text-sm text-fg">{{ t('fpga.noBinTitle') }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton @click="showNoBin = false; void onCompile()">{{ t('fpga.compile') }}</AppButton>
          <AppButton variant="secondary" @click="onChooseUpload">{{ t('fpga.uploadBin') }}</AppButton>
          <AppButton variant="outline" @click="showNoBin = false">{{ t('fpga.cancel') }}</AppButton>
        </div>
      </div>
    </div>

    <div
      v-if="showFirefoxNotice"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div class="max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
        <p class="text-sm font-semibold text-fg">{{ t('app.firefoxTitle') }}</p>
        <p class="mt-2 text-sm leading-relaxed text-muted">{{ t('app.firefoxBody') }}</p>
        <div class="mt-4">
          <AppButton @click="dismissFirefoxNotice">{{ t('app.firefoxAccept') }}</AppButton>
        </div>
      </div>
    </div>
  </div>
</template>
