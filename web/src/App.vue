<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import VerilogEditor from '@/components/VerilogEditor.vue'
import PaletteSelector from '@/components/PaletteSelector.vue'
import AppButton from '@/components/ui/AppButton.vue'
import BoardHelpModal from '@/components/BoardHelpModal.vue'
import BoardSelector from '@/components/BoardSelector.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import CustomBoardModal from '@/components/CustomBoardModal.vue'
import ExportProjectModal from '@/components/ExportProjectModal.vue'
import HelpModal from '@/components/HelpModal.vue'
import HexViewModal from '@/components/HexViewModal.vue'
import IcebramModal from '@/components/IcebramModal.vue'
import PcfIssueModal from '@/components/PcfIssueModal.vue'
import PllModal from '@/components/PllModal.vue'
import ProblemsPanel from '@/components/ProblemsPanel.vue'
import ProjectBar from '@/components/ProjectBar.vue'
import ResourcePanel from '@/components/ResourcePanel.vue'
import ShareModal from '@/components/ShareModal.vue'
import SwapLabel from '@/components/ui/SwapLabel.vue'
import UartPlot from '@/components/UartPlot.vue'
import { setActiveBoard } from '@/fpga/activeBoard'
import {
  customBoardProfiles,
  LISTED_BOARDS,
  loadBoardId,
  resolveBoard,
} from '@/fpga/boardCatalog'
import {
  addCustomBoard,
  emptyCustomDraft,
  saveBoardId,
  type BoardProfile,
  type CustomBoardDraft,
} from '@/fpga/boardTypes'
import {
  cancelCompile,
  checkFpga,
  compileFpga,
  fetchCompileArtifact,
  generateBramHex,
  runBramSwap,
  runPll,
  type CompileBoard,
} from '@/fpga/compile'
import { ARTIFACT_NAMES, type ArtifactName } from '@/fpga/compileProtocol'
import { parseToolLog } from '@/fpga/diagnostics'
import {
  hexPairMismatch,
  inspectHexFile,
  parseIcepllOutput,
  validatePllRequest,
  type PllRequest,
  type PllSummary,
} from '@/fpga/icetools'
import {
  parsePnrReport,
  parseYosysStat,
  type BuildRecord,
  type PnrReport,
  type YosysStat,
} from '@/fpga/pnrReport'
import { checkPcf, findTopPorts, parsePcf, parsePcfFrequencies } from '@/fpga/pcfCheck'
import {
  countProblems,
  fromPcfProblems,
  fromToolDiagnostics,
  marksForFile,
  mergeProblems,
  type Problem,
} from '@/fpga/problems'
import {
  buildShareUrl,
  decodeShareProject,
  encodeShareProject,
  readShareCode,
  type ShareProject,
} from '@/fpga/shareLink'
import { describeDiff } from '@/fpga/binCompare'
import {
  addFpgaFile,
  binDownloadName,
  closeFpgaTab,
  deleteFpgaFile,
  getAllowedImportExtensions,
  isPcfFilename,
  normalizeFpgaFilename,
  openFpgaTab,
  pickPcfFile,
  projectZipDownloadName,
  PROJECT_PCF,
  renameFpgaFile,
  sanitizeImportName,
  uniquifyFpgaName,
  visibleFpgaTabs,
  type PcfIssue,
} from '@/fpga/files'
import { FLASH_CONSOLE_BYTES, formatHexDump, toIntelHex } from '@/fpga/flashDump'
import {
  clearProject,
  createProject,
  deleteProjectById,
  loadCurrentProjectId,
  loadProjectById,
  loadProjectIndex,
  migrateLegacyProject,
  renameProject,
  saveCurrentProjectId,
  saveProjectById,
  touchProject,
  type ProjectMeta,
  type StoredProject,
} from '@/fpga/projectStore'
import { trimIce40Image } from '@/fpga/flashPlan'
import {
  closeMpsseSession,
  connectMpsse,
  disconnectMpsse,
  eraseIce40Flash,
  onMpsseConnectionChange,
  programIce40Flash,
  bitbangIce40Sram,
  readFtdiConfigEeprom,
  readIce40Flash,
  resetIce40FromFlash,
  verifyIce40Flash,
} from '@/fpga/programmer'
import {
  BLINKY_TOP,
  cloneStarterFiles,
  filesMatchStarter,
  projectStarter,
} from '@/fpga/starter'
import {
  UART_BAUD_DEFAULT,
  UART_BAUDS,
  hasWebSerial,
  openUartSession,
  type UartSession,
} from '@/fpga/uart'
import {
  clearUartState,
  createPlotSeries,
  createUartState,
  parsePlotValues,
  pushPlotSample,
  pushUartChunk,
  renderUartHex,
  renderUartText,
  UART_LINE_ENDINGS,
  withLineEnding,
  type UartLineEnding,
} from '@/fpga/uartView'
import { classifyUsbError, usbBannerKey } from '@/fpga/usbErrors'
import { verilogFilesFromZip, verilogFilesToZip } from '@/fpga/zipVerilog'
import { setEditorProjectContext } from '@/lib/editorComplete'
import {
  ensureWritePermission,
  hasFsAccess,
  pickProjectFolder,
  readFolderFiles,
  writeFolderFiles,
  type FsDirectoryHandle,
} from '@/lib/fsAccess'
import { isFirefox, WEBSERIAL_FIREFOX_ADDON_URL } from '@/lib/isFirefox'
import {
  clearOfflineCache,
  formatBytes,
  offlineBytesRef,
  offlineStatusRef,
  refreshOfflineBytes,
} from '@/lib/offline'
import type { EditorLanguage } from '@/lib/verilogEditor'
import { readSession, writeSession } from '@/lib/storage'
import {
  autoCheckRef,
  autoVerifyRef,
  uartHexRef,
  uartTimestampsRef,
} from '@/prefs/ide'
import {
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  editorFontSizeRef,
  setEditorFontSizePreference,
} from '@/prefs/editorFont'
import { setLocalePreference } from '@/prefs/locale'
import { beginThemeTransition, setThemePreference, themeRef } from '@/prefs/theme'
import { FIREFOX_NOTICE_KEY, type AppLocale, type AppTheme } from '@/prefs/types'

type DumpDest = 'console' | 'bin' | 'hex'
type FpgaMenu = 'flash' | 'sram' | 'read' | 'eeprom' | 'tools'
/** Pestañas del panel derecho: consola, problemas y recursos del chip. */
type RightTab = 'log' | 'problems' | 'resources'
type UsbAction =
  | 'connect'
  | 'disconnect'
  | 'reconnect'
  | 'program'
  | 'sram'
  | 'erase'
  | 'reset'
  | 'read'
  | 'eeprom'
type UploadThen = 'flash' | 'sram'

const { t, locale } = useI18n()

const isDark = computed(() => themeRef.value === 'dark')
const initialBoard = resolveBoard(loadBoardId())
setActiveBoard(initialBoard)
const initialStarter = projectStarter(initialBoard)

/**
 * Arranque de los proyectos: migra la versión de un solo proyecto, garantiza
 * que haya al menos uno y devuelve el que estaba abierto.
 */
function bootProjects(): {
  index: ProjectMeta[]
  id: string
  project: StoredProject | null
} {
  let index = loadProjectIndex()
  if (index.length === 0) {
    migrateLegacyProject('Mi proyecto')
    index = loadProjectIndex()
  }
  if (index.length === 0) {
    const meta = createProject('Mi proyecto')
    saveCurrentProjectId(meta.id)
    index = loadProjectIndex()
  }
  let id = loadCurrentProjectId()
  if (!id || !index.some((p) => p.id === id)) {
    id = index[0]?.id ?? ''
    if (id) saveCurrentProjectId(id)
  }
  return { index, id, project: id ? loadProjectById(id) : null }
}

const boot = bootProjects()
const projects = ref<ProjectMeta[]>(boot.index)
const currentProjectId = ref(boot.id)
const savedProject = boot.project
const showRemoveProject = ref(false)
const boardId = ref(initialBoard.id)
const customBoards = ref(customBoardProfiles())
const customDraft = ref<CustomBoardDraft>(emptyCustomDraft())
const helpBoard = ref<BoardProfile | null>(null)
const showHelp = ref(false)
const showCustomModal = ref(false)
const files = ref(
  savedProject ? savedProject.files.map((f) => ({ ...f })) : cloneStarterFiles(initialStarter),
)
const activeName = ref(
  savedProject?.activeName || initialStarter.files[0]?.name || 'top_module.v',
)
const top = ref(savedProject?.top.trim() ? savedProject.top : initialStarter.top)
const pcfIssue = ref<PcfIssue | null>(null)
const showResetConfirm = ref(false)
const bin = shallowRef<Uint8Array | null>(null)
const logText = ref('')
const busyCompile = ref(false)
const usbAction = ref<UsbAction | null>(null)
const boardConnected = ref(false)
const lastUsbFail = ref<import('@/fpga/usbErrors').UsbFailKind | null>(null)
const uploadThen = ref<UploadThen | null>(null)
const progressDone = ref(0)
const progressTotal = ref(0)
const progressLabel = ref('')
const showNoBin = ref(false)
const showFirefoxNotice = ref(false)
const openMenu = ref<FpgaMenu | null>(null)
const compileBinLink = ref<{ n: number; name: string } | null>(null)
const renaming = ref<string | null>(null)
const renameDraft = ref('')
const renameWhere = ref<'tree' | 'tabs' | null>(null)
const treeRenameInput = ref<HTMLInputElement | null>(null)
const tabsRenameInput = ref<HTMLInputElement | null>(null)
const showExportModal = ref(false)
let renameReady = false
const fileInput = ref<HTMLInputElement | null>(null)
const zipInput = ref<HTMLInputElement | null>(null)
const logEl = ref<HTMLElement | null>(null)
const uartEl = ref<HTMLElement | null>(null)
const uartConnected = ref(false)
const uartBusy = ref(false)
const uartBaud = ref<(typeof UART_BAUDS)[number]>(UART_BAUD_DEFAULT)
let uartSession: UartSession | null = null
let uartRaf: number | null = null
const editorFontPx = editorFontSizeRef
const binObjectUrl = ref<string | null>(null)
let stopConnectionWatch: (() => void) | null = null
let logRaf: number | null = null
const logPending: string[] = []

// ---- Modo IDE ------------------------------------------------------------
const editorRef = ref<InstanceType<typeof VerilogEditor> | null>(null)
const rightTab = ref<RightTab>('log')
/** Lo que dijeron Yosys y nextpnr en el último compile o revisión. */
const toolProblems = ref<Problem[]>([])
const report = ref<PnrReport | null>(null)
const stat = ref<YosysStat | null>(null)
const buildHistory = ref<BuildRecord[]>([])
const checking = ref(false)
/** El WASM ya se bajó al menos una vez: recién ahí conviene revisar solo. */
const yosysWarm = ref(false)
/** Cambió algo desde la última revisión: el indicador lo dice. */
const checkDirty = ref(true)
let checkTimer: ReturnType<typeof setTimeout> | null = null

// Compartir por link
const showShare = ref(false)
const shareUrl = ref('')
const pendingShare = ref<ShareProject | null>(null)

// Asistente de PLL
const showPll = ref(false)
const pllBusy = ref(false)
const pllSummary = ref<PllSummary | null>(null)
const pllVerilog = ref<string | null>(null)
const pllError = ref<string | null>(null)
const pllFileName = ref('pll.v')

// Cambiar ROM (icebram)
const showBram = ref(false)
const bramBusy = ref(false)
const bramError = ref<string | null>(null)
const bramNote = ref<string | null>(null)
const hasBitstream = ref(false)

// Visor hexadecimal
const showHexView = ref(false)
const hexTitle = ref('')
const hexData = shallowRef<Uint8Array | null>(null)

// Carpeta del disco (File System Access)
const folderHandle = shallowRef<FsDirectoryHandle | null>(null)
const folderName = ref('')
const fsSupported = hasFsAccess()

// Consola UART
const uartState = createUartState()
const uartVersion = ref(0)
const plotSeries = createPlotSeries()
const plotVersion = ref(0)
const showPlot = ref(false)
const uartInput = ref('')
const uartEnding = ref<UartLineEnding>('lf')
const uartSendHistory: string[] = []
let uartHistoryAt = -1
const uartPendingChunks: { bytes: Uint8Array; text: string; ts: number }[] = []

const slimBtn = '!h-[25px] min-h-[25px] px-2 text-xs rounded-md max-md:!h-8 max-md:min-h-8'
const dropMenu =
  'absolute z-30 mt-1 min-w-max rounded-lg border border-border bg-surface py-1 shadow-lg'
const dropMenuStart = `${dropMenu} left-0`
const dropMenuEnd = `${dropMenu} right-0`
const dropItem =
  'block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-fg hover:bg-surface-2'
const usbBusy = computed(() => usbAction.value != null)
const showReconnect = computed(() => {
  const k = lastUsbFail.value
  return !usbBusy.value && (k === 'short_read' || k === 'winusb' || k === 'timeout')
})
const uiLocked = computed(() => busyCompile.value)
const progressPct = computed(() => {
  if (progressTotal.value <= 0) return 0
  return Math.min(100, Math.round((progressDone.value / progressTotal.value) * 100))
})
const showProgress = computed(
  () =>
    usbAction.value === 'program' ||
    usbAction.value === 'sram' ||
    usbAction.value === 'read',
)
const openTabs = computed(() => visibleFpgaTabs(files.value))
const activeFile = computed(
  () => files.value.find((f) => f.name === activeName.value && f.open) ?? null,
)
const editorLanguage = computed<EditorLanguage>(() => {
  const name = activeFile.value?.name ?? ''
  if (isPcfFilename(name)) return 'pcf'
  return name.toLowerCase().endsWith('.v') ? 'verilog' : 'plain'
})
const lineCount = computed(() => {
  const text = activeFile.value?.content ?? ''
  if (!text) return 0
  return text.split('\n').length
})

const lineCountLabel = computed(() => t('editor.lineCount', { n: lineCount.value }))
const webserialAddonUrl = WEBSERIAL_FIREFOX_ADDON_URL

// ---- Problemas: lo que dicen las herramientas + el cruce PCF ↔ top --------

const projectFiles = computed(() =>
  files.value.map((f) => ({ name: f.name, content: f.content })),
)

const hexFiles = computed(() =>
  projectFiles.value.filter((f) => f.name.toLowerCase().endsWith('.hex')),
)

/**
 * Se recalcula con cada tecla y no cuesta nada: los errores de pines aparecen
 * antes de compilar, que es donde duelen menos.
 */
const pcfProblems = computed(() => {
  const pick = pickPcfFile(files.value)
  if (pick.kind !== 'ok') return []
  const found = findTopPorts(projectFiles.value, top.value.trim() || BLINKY_TOP)
  return checkPcf({
    ports: found.ports,
    constraints: parsePcf(pick.file.content),
    pcfName: pick.file.name,
    topName: top.value.trim() || BLINKY_TOP,
    topFile: found.file,
  })
})

const problems = computed(() =>
  mergeProblems(toolProblems.value, fromPcfProblems(pcfProblems.value)),
)

/**
 * Relojes con `set_frequency` en el PCF. Sin esa línea nextpnr compara contra
 * su default de 12 MHz y el PASA del panel no significa nada.
 */
const constrainedClocks = computed(() => {
  const pick = pickPcfFile(files.value)
  if (pick.kind !== 'ok') return []
  return parsePcfFrequencies(pick.file.content).map((f) => f.net)
})
const problemCounts = computed(() => countProblems(problems.value))
const editorMarks = computed(() =>
  activeFile.value ? marksForFile(problems.value, activeFile.value.name) : [],
)

/** Traduce el log de las herramientas a problemas con archivo y línea. */
function readToolLog(log: string) {
  const pick = pickPcfFile(files.value)
  const diags = parseToolLog(log.split('\n'), {
    files: files.value.map((f) => f.name),
    pcfName: pick.kind === 'ok' ? pick.file.name : undefined,
  })
  toolProblems.value = fromToolDiagnostics(diags)
}

function openProblem(problem: Problem) {
  if (!problem.file) return
  if (!files.value.some((f) => f.name === problem.file)) return
  onOpenFile(problem.file)
  if (problem.line == null) return
  void nextTick(() => editorRef.value?.jumpToLine(problem.line as number))
}

// ---- Revisión rápida (Yosys sin place & route) ----------------------------

/** Estado del indicador de revisión, al lado de las pestañas. */
const checkState = computed<'checking' | 'stale' | 'clean'>(() => {
  if (checking.value) return 'checking'
  return checkDirty.value ? 'stale' : 'clean'
})

async function onCheck(manual = false) {
  if (busyCompile.value || checking.value) return
  checking.value = true
  try {
    const result = await checkFpga(projectFiles.value, top.value.trim() || BLINKY_TOP)
    if (result.status === 'skipped') return
    yosysWarm.value = true
    checkDirty.value = false
    readToolLog(result.log)
    if (manual) {
      const { errors, warnings } = problemCounts.value
      appendLog(
        errors > 0 || warnings > 0
          ? t('ide.checkFound', { errors, warnings })
          : t('ide.checkClean'),
      )
      if (errors > 0 || warnings > 0) rightTab.value = 'problems'
    }
  } catch (err) {
    if (manual) appendLog(compileErrorMessage(err))
  } finally {
    checking.value = false
  }
}

/** Al dejar de escribir. Solo cuando el WASM ya está en el navegador. */
function scheduleCheck() {
  if (checkTimer != null) clearTimeout(checkTimer)
  checkDirty.value = true
  if (!autoCheckRef.value || !yosysWarm.value) return
  checkTimer = setTimeout(() => {
    checkTimer = null
    void onCheck(false)
  }, 900)
}

function onEditorSave() {
  void onCheck(true)
}

function onCancelCompile() {
  if (!cancelCompile()) return
  // Al matar el worker se va con él el `.asc` del último compile: icebram ya no
  // tiene con qué trabajar hasta que se compile de nuevo.
  hasBitstream.value = false
  appendLog(t('ide.cancelled'))
}

function logNeedWebSerial() {
  if (isFirefox()) {
    appendLog(t('fpga.needWebSerialFirefox'))
    appendLog(WEBSERIAL_FIREFOX_ADDON_URL)
    return
  }
  appendLog(t('fpga.needWebSerial'))
}

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
    writeSession(FIREFOX_NOTICE_KEY, '1')
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
  setEditorFontSizePreference(editorFontPx.value + delta)
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
  if (renaming.value === name) cancelRename()
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
  if (added) {
    activeName.value = added.name
    beginRename(added.name, 'tabs')
  }
}

function onDeleteFile(name: string) {
  if (files.value.length <= 1) return
  const next = deleteFpgaFile(files.value, name)
  files.value = next
  if (renaming.value === name) {
    renaming.value = null
    renameWhere.value = null
  }
  if (activeName.value === name) {
    const open = visibleFpgaTabs(next)[0]
    activeName.value = open?.name ?? next[0]?.name ?? ''
  }
}

function getRenameElement(where: 'tree' | 'tabs'): HTMLInputElement | null {
  const raw = where === 'tree' ? treeRenameInput.value : tabsRenameInput.value
  if (!raw) return null
  if (Array.isArray(raw)) return (raw[0] as HTMLInputElement) ?? null
  return raw as HTMLInputElement
}

async function beginRename(name: string, where: 'tree' | 'tabs') {
  if (renaming.value && renaming.value !== name) commitRename()
  renaming.value = name
  renameWhere.value = where
  renameDraft.value = name.endsWith('.v') ? name.replace(/\.v$/i, '') : name
  renameReady = true
  await nextTick()
  const el = getRenameElement(where)
  if (el && typeof el.focus === 'function') {
    el.focus()
    el.select()
  }
}

function commitRename() {
  if (!renameReady) return
  const from = renaming.value
  if (!from) return
  renameReady = false
  const next = renameFpgaFile(files.value, from, renameDraft.value)
  const to = normalizeFpgaFilename(renameDraft.value)
  files.value = next
  if (to && next.some((f) => f.name === to)) {
    if (activeName.value === from) activeName.value = to
  }
  renaming.value = null
  renameWhere.value = null
}

function cancelRename() {
  renameReady = false
  renaming.value = null
  renameWhere.value = null
}

function onRenameKey(ev: KeyboardEvent) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    commitRename()
    return
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancelRename()
  }
}

function onImportZip() {
  zipInput.value?.click()
}

function onExportZip() {
  showExportModal.value = true
}

function handleConfirmExport(projectName: string) {
  const openFiles = files.value.filter((f) => f.open)
  const toExport = openFiles.length > 0 ? openFiles : files.value
  const zip = verilogFilesToZip(toExport.map((f) => ({ name: f.name, content: f.content })))
  const zipName = projectZipDownloadName(projectName)
  downloadNamed(zipName, new Blob([zip], { type: 'application/zip' }))
  showExportModal.value = false
}

async function onZipFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const allowedExts = getAllowedImportExtensions()
    const imported = await verilogFilesFromZip(await file.arrayBuffer(), allowedExts)
    if (imported.length === 0) {
      appendLog(t('fpga.zipNoFiles', { exts: allowedExts.map((e) => `.${e}`).join(', ') }))
      return
    }
    files.value = imported.map((f) => ({ ...f, open: true }))
    activeName.value = files.value[0]?.name ?? ''
    appendLog(t('fpga.zipImported', { n: imported.length, name: file.name }))
  } catch (err) {
    appendLog(err instanceof Error ? err.message : t('fpga.zipReadFailed'))
  }
}

function flushUart() {
  uartRaf = null
  if (uartPendingChunks.length === 0) return
  const before = uartState.lines.length
  for (const chunk of uartPendingChunks.splice(0)) {
    pushUartChunk(uartState, chunk.text, chunk.bytes, chunk.ts)
  }
  // Cada línea nueva puede ser una muestra para el gráfico.
  const added = uartState.lines.slice(Math.max(0, before - 1))
  let plotted = false
  for (const line of added) {
    const sample = parsePlotValues(line.text)
    if (!sample) continue
    pushPlotSample(plotSeries, sample)
    plotted = true
  }
  if (plotted) plotVersion.value += 1
  uartVersion.value += 1
}

function onUartChunk(bytes: Uint8Array, text: string) {
  uartPendingChunks.push({ bytes, text, ts: Date.now() })
  if (uartRaf == null) uartRaf = requestAnimationFrame(flushUart)
}

const uartView = computed(() => {
  // uartVersion es la dependencia: el buffer se muta en su lugar.
  void uartVersion.value
  return uartHexRef.value
    ? renderUartHex(uartState)
    : renderUartText(uartState, { timestamps: uartTimestampsRef.value })
})

function clearUart() {
  uartPendingChunks.length = 0
  clearUartState(uartState)
  plotSeries.rows = []
  plotSeries.labels = []
  plotVersion.value += 1
  uartVersion.value += 1
}

function saveUartLog() {
  const text = renderUartText(uartState, { timestamps: true })
  if (!text) return
  downloadNamed('uart.txt', new Blob([text], { type: 'text/plain;charset=utf-8' }))
  appendLog(t('uart.logSaved'))
}

async function sendUart() {
  const text = uartInput.value
  if (!uartSession || !text) return
  try {
    const ok = await uartSession.write(withLineEnding(text, uartEnding.value))
    if (!ok) {
      appendLog(t('uart.writeFailed'))
      return
    }
    uartSendHistory.push(text)
    if (uartSendHistory.length > 50) uartSendHistory.shift()
    uartHistoryAt = uartSendHistory.length
    uartInput.value = ''
  } catch (err) {
    appendLog(uartErrorMessage(err))
  }
}

/** Flechas arriba/abajo: historial de lo enviado, como en cualquier terminal. */
function onUartInputKey(ev: KeyboardEvent) {
  if (ev.key === 'ArrowUp') {
    if (uartSendHistory.length === 0) return
    ev.preventDefault()
    uartHistoryAt = Math.max(0, uartHistoryAt - 1)
    uartInput.value = uartSendHistory[uartHistoryAt] ?? ''
    return
  }
  if (ev.key === 'ArrowDown') {
    if (uartSendHistory.length === 0) return
    ev.preventDefault()
    uartHistoryAt = Math.min(uartSendHistory.length, uartHistoryAt + 1)
    uartInput.value = uartSendHistory[uartHistoryAt] ?? ''
  }
}

async function onUartConnect() {
  if (!hasWebSerial()) {
    logNeedWebSerial()
    return
  }
  uartBusy.value = true
  try {
    uartSession = await openUartSession({
      baudRate: uartBaud.value,
      onChunk: onUartChunk,
      onDisconnect: () => {
        uartConnected.value = false
        uartSession = null
      },
    })
    uartConnected.value = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('No port selected') || msg.toLowerCase().includes('cancel')) return
    if (msg === 'NEED_WEB_SERIAL') {
      logNeedWebSerial()
      return
    }
    appendLog(uartErrorMessage(err))
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
  compileBinLink.value = null
}

function setBin(next: Uint8Array) {
  bin.value = markRaw(next)
  if (binObjectUrl.value) URL.revokeObjectURL(binObjectUrl.value)
  binObjectUrl.value = URL.createObjectURL(new Blob([next], { type: 'application/octet-stream' }))
}

function clearBin() {
  bin.value = null
  compileBinLink.value = null
  if (binObjectUrl.value) {
    URL.revokeObjectURL(binObjectUrl.value)
    binObjectUrl.value = null
  }
}

/** Perfil de la placa activa. Computed: `resolveBoard` lee localStorage. */
const activeBoard = computed<BoardProfile>(() => resolveBoard(boardId.value))

function activeProfile(): BoardProfile {
  return activeBoard.value
}

function compileBoardPayload(): CompileBoard {
  const board = activeProfile()
  return {
    device: board.fpga.nextpnr_device,
    package: board.fpga.nextpnr_package,
  }
}

function applyBoard(id: string) {
  const prev = activeProfile()
  const next = resolveBoard(id)
  const keep = filesMatchStarter(files.value, projectStarter(prev))
  boardId.value = next.id
  saveBoardId(next.id)
  setActiveBoard(next)
  clearBin()
  if (keep) {
    const starter = projectStarter(next)
    files.value = cloneStarterFiles(starter)
    activeName.value = starter.files[0]?.name ?? 'top_module.v'
    top.value = starter.top
  } else {
    appendLog(t('board.keptFiles', { name: next.title }))
  }
}

function onBoardSelect(id: string) {
  if (id === boardId.value) return
  applyBoard(id)
}

function onBoardHelp(id: string) {
  helpBoard.value = resolveBoard(id)
}

/** Agrega el PCF de la placa activa al proyecto, como `pins.pcf`. */
function addBoardPcfToProject() {
  const board = activeProfile()
  const text = board.starterPcf
  pcfIssue.value = null
  if (!text.trim()) return
  const exists = files.value.some((f) => f.name === PROJECT_PCF)
  files.value = exists
    ? files.value.map((f) => (f.name === PROJECT_PCF ? { ...f, content: text, open: true } : f))
    : [...files.value, { name: PROJECT_PCF, content: text, open: true }]
  activeName.value = PROJECT_PCF
  appendLog(t('board.pcfCopied', { name: PROJECT_PCF, board: board.title }))
}

function askResetProject() {
  showResetConfirm.value = true
}

/** Vuelve al laboratorio de la placa activa y borra lo guardado en el browser. */
function resetProject() {
  const starter = projectStarter(activeProfile())
  files.value = cloneStarterFiles(starter)
  activeName.value = starter.files[0]?.name ?? PROJECT_PCF
  top.value = starter.top
  clearBin()
  clearProject()
  // La carpeta del disco era de lo que había antes: soltarla evita que
  // "Guardar en <carpeta>" escriba en un lugar que ya no tiene que ver.
  closeFolder(false)
  hasBitstream.value = false
  showResetConfirm.value = false
  pcfIssue.value = null
  appendLog(t('fpga.projectResetDone'))
}

function openCustomModal() {
  customDraft.value = emptyCustomDraft()
  showCustomModal.value = true
}

function onCustomSave(draft: CustomBoardDraft) {
  const stored = addCustomBoard({
    ...draft,
    title: draft.title.trim() || t('board.untitled', { n: customBoards.value.length + 1 }),
  })
  customBoards.value = customBoardProfiles()
  showCustomModal.value = false
  applyBoard(stored.id)
}

type CompileFailCode =
  | 'COMPILE_BUSY'
  | 'COMPILE_TOO_LARGE'
  | 'COMPILE_BAD_INPUT'
  | 'COMPILE_NO_PCF'
  | 'COMPILE_MANY_PCF'
  | 'COMPILE_WORKER'
type UartFailCode = 'NEED_WEB_SERIAL' | 'UART_NO_READABLE'

function isCompileFailCode(msg: string): msg is CompileFailCode {
  return (
    msg === 'COMPILE_BUSY' ||
    msg === 'COMPILE_TOO_LARGE' ||
    msg === 'COMPILE_BAD_INPUT' ||
    msg === 'COMPILE_NO_PCF' ||
    msg === 'COMPILE_MANY_PCF' ||
    msg === 'COMPILE_WORKER'
  )
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
    case 'COMPILE_BAD_INPUT':
      return t('fpga.compileBadInput')
    case 'COMPILE_NO_PCF':
      return t('fpga.compileNoPcf', { name: PROJECT_PCF })
    case 'COMPILE_MANY_PCF':
      return t('fpga.compileManyPcf')
    case 'COMPILE_WORKER':
      return t('fpga.compileWorker')
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
    case 'sram':
      return t('fpga.sramming')
    case 'read':
      return t('fpga.reading')
    default:
      return phase
  }
}

/** Una fila más del historial de builds del panel de recursos. */
function recordBuild(bytes: number | null) {
  const lc = report.value?.utilisation.find((u) => u.name === 'ICESTORM_LC') ?? null
  const fmax = report.value?.fmax[0] ?? null
  buildHistory.value = [
    {
      at: Date.now(),
      top: top.value.trim() || BLINKY_TOP,
      lcUsed: lc?.used ?? null,
      lcAvailable: lc?.available ?? null,
      fmax: fmax?.achieved ?? null,
      constraint: fmax?.constraint ?? null,
      bytes,
    },
    ...buildHistory.value,
  ].slice(0, 8)
}

async function onCompile() {
  showNoBin.value = false
  if (busyCompile.value) return
  const payload = compileBoardPayload()
  busyCompile.value = true
  appendLog(t('fpga.compileQueuedBrowser'))
  try {
    const result = await compileFpga(
      projectFiles.value,
      top.value.trim() || BLINKY_TOP,
      payload,
      (line) => appendLog(line),
    )
    yosysWarm.value = true
    checkDirty.value = false
    readToolLog(result.log)
    report.value = parsePnrReport(result.report)
    stat.value = parseYosysStat(result.log, top.value.trim() || BLINKY_TOP)
    if (result.status === 'success' && result.bin) {
      hasBitstream.value = true
      setBin(result.bin)
      appendLog(t('fpga.binReady', { n: result.bin.length }))
      compileBinLink.value = { n: result.bin.length, name: binDownloadName(top.value) }
      recordBuild(result.bin.length)
      const lc = report.value?.utilisation.find((u) => u.name === 'ICESTORM_LC')
      const fmax = report.value?.fmax[0]
      if (lc || fmax) {
        appendLog(
          t('ide.summaryLine', {
            used: lc?.used ?? 0,
            available: lc?.available ?? 0,
            fmax: fmax ? fmax.achieved.toFixed(2) : '—',
            constraint: fmax ? fmax.constraint.toFixed(2) : '—',
          }),
        )
      }
    } else if (result.status !== 'success') {
      hasBitstream.value = false
      appendLog(t('fpga.compileNoBin'))
      if (problemCounts.value.errors > 0) rightTab.value = 'problems'
    }
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'COMPILE_CANCELLED') return
    appendLog(compileErrorMessage(err))
    // Sin .pcf (o con varios) no hay compile: el modal explica y ofrece el de la placa.
    if (code === 'COMPILE_NO_PCF' || code === 'COMPILE_MANY_PCF') {
      const pick = pickPcfFile(files.value)
      pcfIssue.value = pick.kind === 'ok' ? { kind: 'none' } : pick
    }
  } finally {
    busyCompile.value = false
  }
}

function onProgress(done: number, total: number, phase: string) {
  progressDone.value = done
  progressTotal.value = total
  progressLabel.value = progressPhrase(phase)
}

watch([logText, compileBinLink], async () => {
  await nextTick()
  const el = logEl.value
  if (el) el.scrollTop = el.scrollHeight
})

watch(uartVersion, async () => {
  await nextTick()
  const el = uartEl.value
  if (el) el.scrollTop = el.scrollHeight
})

function closeMenu() {
  openMenu.value = null
}

function toggleMenu(id: FpgaMenu) {
  if (usbBusy.value) return
  switch (id) {
    case 'flash':
    case 'sram':
      if (uiLocked.value) return
      break
    case 'read':
    case 'eeprom':
    case 'tools':
      break
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
  openMenu.value = openMenu.value === id ? null : id
}

function onPointerDownAway(ev: PointerEvent) {
  const node = ev.target
  if (!(node instanceof Element) || node.closest('[data-fpga-drop]')) return
  closeMenu()
}

function needWebUsb(): boolean {
  if (isFirefox()) {
    appendLog(t('fpga.needWebUsbFirefox'))
    return false
  }
  if (navigator.usb) return true
  appendLog(t('fpga.needWebUsb'))
  return false
}

function usbCatch(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  const kind = classifyUsbError(msg)
  lastUsbFail.value = kind
  const key = usbBannerKey(kind)
  if (key == null) {
    appendLog(t('fpga.noUsbDevice'))
    return
  }
  appendLog(t(key))
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
  lastUsbFail.value = null
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
  await runUsb('program', async () => {
    await programIce40Flash(bin.value!, appendLog, onProgress)
    if (!autoVerifyRef.value || !bin.value) return
    appendLog(t('ide.verifying'))
    const diff = await verifyIce40Flash(bin.value, appendLog, onProgress)
    appendLog(diff.equal ? t('ide.verifyOk') : t('ide.verifyBad', { detail: describeDiff(diff) }))
  })
}

async function doSram() {
  if (!bin.value) return
  showNoBin.value = false
  await runUsb('sram', async () => {
    // El bitbang por ADBUS2 en modo bitbang del FTDI es el camino rápido y el
    // que funciona. Si fallara (otra placa, otro FTDI), reintentamos por GPIO
    // del MPSSE, que es más lento pero no cambia de modo.
    let r = await bitbangIce40Sram(bin.value!, appendLog, onProgress, { fast: true })
    if (!r.cdone && r.adbus2Drives) {
      appendLog(t('fpga.sramRetryMpsse'))
      r = await bitbangIce40Sram(bin.value!, appendLog, onProgress, { fast: false })
    }
    if (!r.cdone) appendLog(t('fpga.sramCdoneLow'))
  })
}

function onFlashCompiled() {
  closeMenu()
  if (!bin.value) {
    showNoBin.value = true
    return
  }
  void doProgram()
}

function onSramCompiled() {
  closeMenu()
  if (!bin.value) {
    showNoBin.value = true
    return
  }
  void doSram()
}

function onFlashUpload() {
  closeMenu()
  uploadThen.value = 'flash'
  fileInput.value?.click()
}

function onSramUpload() {
  closeMenu()
  uploadThen.value = 'sram'
  fileInput.value?.click()
}

async function onReset() {
  clearUart()
  await runUsb('reset', async () => {
    appendLog(t('fpga.resetLog'))
    await resetIce40FromFlash(appendLog)
  })
}

async function onErase() {
  if (!window.confirm(t('fpga.eraseConfirm'))) {
    return
  }
  await runUsb('erase', () => eraseIce40Flash(appendLog))
}

async function onReadFlash(dest: DumpDest) {
  closeMenu()
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
  if (!needWebUsb()) return
  appendLog(t('fpga.connectPicker'))
  await runUsb('connect', () => connectMpsse(appendLog, { forcePicker: true }))
}

async function onReadEeprom(dest: DumpDest) {
  closeMenu()
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

async function onDisconnect() {
  await runUsb('disconnect', () => disconnectMpsse(appendLog))
}

async function onReconnect() {
  appendLog(t('fpga.reconnecting'))
  await runUsb('reconnect', async () => {
    await closeMpsseSession({ forget: false, resetUsb: true })
    await connectMpsse(appendLog)
  })
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
    switch (nextAction) {
      case 'flash':
        void doProgram()
        break
      case 'sram':
        void doSram()
        break
      case null:
        break
      default: {
        const _exhaustive: never = nextAction
        return _exhaustive
      }
    }
  })
}

// ---- Verificar lo grabado ------------------------------------------------

async function onVerifyFlash() {
  closeMenu()
  if (!bin.value) {
    showNoBin.value = true
    return
  }
  await runUsb('read', async () => {
    const diff = await verifyIce40Flash(bin.value!, appendLog, onProgress)
    appendLog(diff.equal ? t('ide.verifyOk') : t('ide.verifyBad', { detail: describeDiff(diff) }))
  })
}

function onShowBinHex() {
  closeMenu()
  if (!bin.value) {
    showNoBin.value = true
    return
  }
  hexTitle.value = t('hex.binTitle', { name: binDownloadName(top.value), n: bin.value.length })
  hexData.value = bin.value
  showHexView.value = true
}

// ---- Compartir el proyecto por link --------------------------------------

async function onShare() {
  closeMenu()
  try {
    const code = await encodeShareProject({
      top: top.value,
      boardId: boardId.value,
      files: projectFiles.value,
    })
    shareUrl.value = buildShareUrl(window.location.href, code)
    showShare.value = true
  } catch {
    appendLog(t('share.failed'))
  }
}

function isProjectName(name: string): boolean {
  return normalizeFpgaFilename(name) === name
}

/** Si la URL trae `#p=…`, se ofrece abrirlo (reemplaza el proyecto actual). */
async function loadSharedFromHash() {
  const code = readShareCode(window.location.hash)
  if (!code) return
  const project = await decodeShareProject(code)
  // El link queda limpio pase lo que pase: no queremos preguntar en cada F5.
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (!project) {
    appendLog(t('share.badLink'))
    return
  }
  pendingShare.value = project
}

function acceptShared() {
  const project = pendingShare.value
  pendingShare.value = null
  if (!project) return
  const allowed = project.files.filter((f) => isProjectName(f.name))
  if (allowed.length === 0) {
    appendLog(t('share.badLink'))
    return
  }
  if (project.boardId && project.boardId !== boardId.value) applyBoard(project.boardId)
  files.value = allowed.map((f) => ({ ...f, open: true }))
  activeName.value = allowed[0]?.name ?? ''
  if (project.top.trim()) top.value = project.top
  clearBin()
  appendLog(t('share.opened', { n: allowed.length }))
}

// ---- Asistente de PLL (icepll) -------------------------------------------

function openPll() {
  closeMenu()
  pllError.value = null
  showPll.value = true
}

function pllErrorMessage(code: string): string {
  switch (code) {
    case 'PLL_BAD_INPUT':
      return t('pll.badInput')
    case 'PLL_BAD_OUTPUT':
      return t('pll.badOutput')
    case 'PLL_BAD_NAME':
      return t('pll.badName')
    case 'PLL_BAD_FILE':
      return t('pll.badFile')
    default:
      return t('pll.failed')
  }
}

async function onPllRun(req: PllRequest) {
  const invalid = validatePllRequest(req)
  if (invalid) {
    pllError.value = pllErrorMessage(invalid)
    return
  }
  pllBusy.value = true
  pllError.value = null
  pllSummary.value = null
  pllVerilog.value = null
  try {
    const result = await runPll(req)
    yosysWarm.value = true
    if (result.status !== 'success' || !result.verilog) {
      pllError.value = t('pll.failed')
      appendLog(result.log)
      return
    }
    pllSummary.value = parseIcepllOutput(result.log)
    pllVerilog.value = result.verilog
    pllFileName.value = req.fileName
  } catch (err) {
    pllError.value = compileErrorMessage(err)
  } finally {
    pllBusy.value = false
  }
}

function onPllAdd() {
  const text = pllVerilog.value
  const name = pllFileName.value
  if (!text || !name) return
  const exists = files.value.some((f) => f.name === name)
  files.value = exists
    ? files.value.map((f) => (f.name === name ? { ...f, content: text, open: true } : f))
    : [...files.value, { name, content: text, open: true }]
  activeName.value = name
  showPll.value = false
  appendLog(t('pll.added', { name }))
}

// ---- Cambiar el contenido de una ROM sin re-sintetizar (icebram) ----------

function openBram() {
  closeMenu()
  bramError.value = null
  bramNote.value = null
  showBram.value = true
}

async function onBramRun(pair: { from: string; to: string }) {
  const from = hexFiles.value.find((f) => f.name === pair.from)
  const to = hexFiles.value.find((f) => f.name === pair.to)
  if (!from || !to) return
  const fromInfo = inspectHexFile(from.content)
  const toInfo = inspectHexFile(to.content)
  if ('error' in fromInfo) {
    bramError.value = `${from.name}: ${t(`icebram.${fromInfo.error}`)}`
    return
  }
  if ('error' in toInfo) {
    bramError.value = `${to.name}: ${t(`icebram.${toInfo.error}`)}`
    return
  }
  const mismatch = hexPairMismatch(fromInfo.info, toInfo.info)
  if (mismatch) {
    bramError.value = t(`icebram.${mismatch}`)
    return
  }
  bramBusy.value = true
  bramError.value = null
  bramNote.value = null
  try {
    const result = await runBramSwap(from, to, (line) => appendLog(line))
    if (result.status !== 'success' || !result.bin) {
      bramError.value = t('icebram.failed')
      return
    }
    setBin(result.bin)
    compileBinLink.value = { n: result.bin.length, name: binDownloadName(top.value) }
    recordBuild(result.bin.length)
    bramNote.value = t('icebram.done', { n: result.bin.length })
    appendLog(t('icebram.done', { n: result.bin.length }))
  } catch (err) {
    bramError.value = compileErrorMessage(err)
  } finally {
    bramBusy.value = false
  }
}

async function onBramGenerate(spec: { widthBits: number; words: number; name: string }) {
  const name = normalizeFpgaFilename(spec.name)
  if (!name || !name.toLowerCase().endsWith('.hex')) {
    bramError.value = t('icebram.badName')
    return
  }
  bramBusy.value = true
  bramError.value = null
  bramNote.value = null
  try {
    const result = await generateBramHex(spec.widthBits, spec.words, (line) => appendLog(line))
    const hex = result.hex
    if (result.status !== 'success' || !hex) {
      bramError.value = t('icebram.genFailed')
      return
    }
    const exists = files.value.some((f) => f.name === name)
    files.value = exists
      ? files.value.map((f) => (f.name === name ? { ...f, content: hex, open: true } : f))
      : [...files.value, { name, content: hex, open: true }]
    bramNote.value = t('icebram.generated', { name, words: spec.words, bits: spec.widthBits })
  } catch (err) {
    bramError.value = compileErrorMessage(err)
  } finally {
    bramBusy.value = false
  }
}

// ---- Carpeta del disco (File System Access) ------------------------------

/** Soltar la carpeta: el permiso y el destino de "Guardar" dejan de aplicar. */
function closeFolder(log = true) {
  if (!folderHandle.value) return
  const name = folderName.value
  folderHandle.value = null
  folderName.value = ''
  if (log) appendLog(t('folder.closed', { name }))
}

async function onOpenFolder() {
  closeMenu()
  try {
    const handle = await pickProjectFolder()
    if (!handle) return
    const allowedExts = getAllowedImportExtensions()
    // Los nombres terminan en la línea de comandos del WASM: los espacios y los
    // acentos entran como `_` en vez de quedar afuera.
    const renamed: string[] = []
    const taken = new Set<string>()
    const found = (
      await readFolderFiles(handle, (name) => {
        const safe = sanitizeImportName(name, allowedExts)
        if (!safe) return null
        const unique = uniquifyFpgaName(safe, taken)
        taken.add(unique)
        if (unique !== name) renamed.push(`${name} → ${unique}`)
        return unique
      })
    ).map((f) => ({ ...f, open: true }))
    if (found.length === 0) {
      appendLog(t('folder.empty', { exts: allowedExts.map((e) => `.${e}`).join(', ') }))
      return
    }
    flushProjectSave()
    closeFolder(false)
    folderHandle.value = handle
    folderName.value = handle.name
    files.value = found
    activeName.value = found[0]?.name ?? ''
    clearBin()
    hasBitstream.value = false
    appendLog(t('folder.opened', { n: found.length, name: handle.name }))
    if (renamed.length) appendLog(t('folder.renamed', { list: renamed.join(', ') }))
  } catch (err) {
    appendLog(err instanceof Error ? err.message : t('folder.failed'))
  }
}

async function onSaveFolder() {
  closeMenu()
  const handle = folderHandle.value
  if (!handle) return
  try {
    if (!(await ensureWritePermission(handle))) {
      appendLog(t('folder.noPermission'))
      return
    }
    const written = await writeFolderFiles(handle, projectFiles.value)
    appendLog(t('folder.saved', { n: written, name: handle.name }))
  } catch (err) {
    appendLog(err instanceof Error ? err.message : t('folder.failed'))
  }
}

// ---- Proyectos guardados en el navegador ---------------------------------

const currentProjectName = computed(
  () => projects.value.find((p) => p.id === currentProjectId.value)?.name ?? '',
)

/** Al cambiar de proyecto, lo que era del anterior deja de aplicar. */
function detachWorkspace() {
  clearBin()
  hasBitstream.value = false
  report.value = null
  stat.value = null
  toolProblems.value = []
  buildHistory.value = []
  closeFolder(false)
}

function applyProject(project: StoredProject | null) {
  const starter = projectStarter(activeProfile())
  if (project) {
    files.value = project.files.map((f) => ({ ...f }))
    activeName.value = project.activeName || files.value[0]?.name || ''
    top.value = project.top.trim() || starter.top
  } else {
    files.value = cloneStarterFiles(starter)
    activeName.value = starter.files[0]?.name ?? PROJECT_PCF
    top.value = starter.top
  }
}

function onSelectProject(id: string) {
  if (id === currentProjectId.value) return
  if (!projects.value.some((p) => p.id === id)) return
  flushProjectSave()
  detachWorkspace()
  currentProjectId.value = id
  saveCurrentProjectId(id)
  applyProject(loadProjectById(id))
  appendLog(t('project.opened', { name: currentProjectName.value }))
}

function onCreateProject() {
  flushProjectSave()
  const meta = createProject()
  projects.value = loadProjectIndex()
  detachWorkspace()
  currentProjectId.value = meta.id
  saveCurrentProjectId(meta.id)
  applyProject(null)
  appendLog(t('project.created', { name: meta.name }))
}

function onRenameProject(name: string) {
  projects.value = renameProject(currentProjectId.value, name)
  appendLog(t('project.renamed', { name: currentProjectName.value }))
}

function askRemoveProject() {
  if (projects.value.length <= 1) return
  showRemoveProject.value = true
}

function removeProject() {
  showRemoveProject.value = false
  const gone = currentProjectName.value
  const rest = deleteProjectById(currentProjectId.value)
  projects.value = rest
  const next = rest[0]
  detachWorkspace()
  if (next) {
    currentProjectId.value = next.id
    saveCurrentProjectId(next.id)
    applyProject(loadProjectById(next.id))
  } else {
    const meta = createProject('Mi proyecto')
    projects.value = loadProjectIndex()
    currentProjectId.value = meta.id
    saveCurrentProjectId(meta.id)
    applyProject(null)
  }
  appendLog(t('project.removed', { name: gone, open: currentProjectName.value }))
}

// ---- Descargas del último compile -----------------------------------------

function artifactDownloadName(name: ArtifactName): string {
  const stem = top.value.trim() || BLINKY_TOP
  const ext = name.slice(name.indexOf('.') + 1)
  return `${stem}.${ext}`
}

async function onDownloadArtifact(name: ArtifactName) {
  closeMenu()
  try {
    const out = await fetchCompileArtifact(name)
    if (out.status !== 'success') {
      appendLog(t('tools.artifactMissing', { name }))
      return
    }
    const fileName = artifactDownloadName(name)
    if (out.bin) {
      downloadNamed(fileName, new Blob([out.bin], { type: 'application/octet-stream' }))
    } else if (out.text != null) {
      downloadNamed(fileName, new Blob([out.text], { type: 'text/plain;charset=utf-8' }))
    } else {
      appendLog(t('tools.artifactMissing', { name }))
      return
    }
    appendLog(t('tools.artifactSaved', { name: fileName }))
  } catch (err) {
    appendLog(compileErrorMessage(err))
  }
}

function onExportLog() {
  if (!logText.value) return
  downloadNamed('consola.txt', new Blob([logText.value], { type: 'text/plain;charset=utf-8' }))
  appendLog(t('fpga.logExported'))
}

// ---- Sin conexión ---------------------------------------------------------

async function onClearOffline() {
  closeMenu()
  await clearOfflineCache()
  appendLog(t('offline.cleared'))
}

// El proyecto vive en el browser: si no queda en localStorage, se pierde al recargar.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let warnedProjectTooBig = false

function persistProject() {
  saveTimer = null
  const id = currentProjectId.value
  if (!id) return
  const ok = saveProjectById(id, {
    top: top.value,
    activeName: activeName.value,
    files: files.value.map((f) => ({ name: f.name, content: f.content, open: f.open })),
  })
  if (ok) {
    projects.value = touchProject(id, Date.now())
    return
  }
  if (warnedProjectTooBig) return
  warnedProjectTooBig = true
  appendLog(t('fpga.projectTooBig'))
}

function scheduleProjectSave() {
  if (saveTimer != null) clearTimeout(saveTimer)
  saveTimer = setTimeout(persistProject, 400)
}

function flushProjectSave() {
  if (saveTimer == null) return
  clearTimeout(saveTimer)
  persistProject()
}

watch([files, top, activeName], scheduleProjectSave, { deep: true })

// El autocompletado lee el proyecto desde afuera del componente del editor.
watch(
  [files, top, activeBoard],
  () => {
    setEditorProjectContext({
      files: projectFiles.value,
      top: top.value.trim() || BLINKY_TOP,
      boardPcf: activeBoard.value.starterPcf,
      clocks: activeBoard.value.fpga.clocks ?? [],
    })
  },
  { deep: true, immediate: true },
)

// Revisión rápida al dejar de escribir (si está activada y el WASM ya está).
watch([files, top], scheduleCheck, { deep: true })

onMounted(() => {
  stopConnectionWatch = onMpsseConnectionChange((open) => {
    boardConnected.value = open
  })
  document.addEventListener('pointerdown', onPointerDownAway)
  window.addEventListener('beforeunload', flushProjectSave)
  if (savedProject) appendLog(t('fpga.projectRestored', { n: savedProject.files.length }))
  scheduleProjectSave()
  void loadSharedFromHash()
  void refreshOfflineBytes()
  if (!isFirefox()) return
  try {
    if (readSession(FIREFOX_NOTICE_KEY) === '1') return
  } catch {
    /* private mode: show once this load */
  }
  showFirefoxNotice.value = true
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDownAway)
  window.removeEventListener('beforeunload', flushProjectSave)
  flushProjectSave()
  stopConnectionWatch?.()
  if (logRaf != null) cancelAnimationFrame(logRaf)
  if (uartRaf != null) cancelAnimationFrame(uartRaf)
  if (checkTimer != null) clearTimeout(checkTimer)
  if (binObjectUrl.value) URL.revokeObjectURL(binObjectUrl.value)
  void uartSession?.close()
  void closeMpsseSession()
})
</script>

<template>
  <div class="flex h-dvh min-h-0 flex-col overflow-hidden max-desk:h-auto max-desk:min-h-dvh max-desk:overflow-x-hidden max-desk:overflow-y-auto">
    <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:px-3">
      <div class="flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="h-7 w-7" width="28" height="28">
        <h1 class="text-sm font-semibold tracking-wide text-fg max-md:text-[0.8125rem] max-md:leading-snug">{{ t('app.title') }}</h1>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 max-md:justify-start">
        <label class="flex items-center gap-2 text-xs font-semibold text-muted">
          <span class="whitespace-nowrap">{{ t('board.pickLabel') }}</span>
          <BoardSelector
            :model-value="boardId"
            :listed="LISTED_BOARDS"
            :customs="customBoards"
            @update:model-value="onBoardSelect"
            @help="onBoardHelp"
            @custom="openCustomModal"
          />
        </label>
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
        <PaletteSelector />
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
        <button
          type="button"
          class="inline-flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          :aria-label="t('app.help')"
          @click="showHelp = true"
        >
          {{ t('app.help') }}
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 gap-4 overflow-hidden px-4 py-3 max-desk:flex-none max-desk:flex-col max-desk:overflow-visible max-md:gap-3 max-md:px-3">
      <section class="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface max-desk:flex-none max-md:flex-col">
        <aside class="flex shrink-0 flex-col overflow-y-auto border-r border-border max-md:w-full max-md:flex-none max-md:overflow-x-auto max-md:overflow-y-hidden max-md:border-r-0 max-md:border-b md:w-[11.5rem]">
          <ProjectBar
            :projects="projects"
            :current-id="currentProjectId"
            @select="onSelectProject"
            @create="onCreateProject"
            @rename="onRenameProject"
            @remove="askRemoveProject"
          />
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
          <ul class="flex flex-col pb-2 max-md:flex-row max-md:overflow-x-auto">
            <li v-for="f in files" :key="f.name" class="max-md:shrink-0">
              <div
                class="flex items-stretch"
                :class="f.name === activeName && f.open ? 'bg-surface-2' : ''"
              >
                <input
                  v-if="renaming === f.name && renameWhere === 'tree'"
                  ref="treeRenameInput"
                  v-model="renameDraft"
                  class="min-w-0 flex-1 bg-surface px-3 py-1.5 font-mono text-sm text-fg outline-none"
                  :aria-label="t('fpga.renameHint')"
                  @click.stop
                  @keydown="onRenameKey"
                  @blur="commitRename"
                >
                <button
                  v-else
                  type="button"
                  class="min-w-0 flex-1 truncate px-3 py-1.5 text-left font-mono text-sm"
                  :class="
                    f.open
                      ? f.name === activeName
                        ? 'font-semibold text-fg'
                        : 'text-fg hover:text-primary'
                      : 'text-muted hover:text-fg'
                  "
                  :title="t('fpga.renameHint')"
                  @click="onOpenFile(f.name)"
                  @dblclick.prevent.stop="beginRename(f.name, 'tree')"
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
              <div
                v-for="f in openTabs"
                :key="f.name"
                role="tab"
                :aria-selected="f.name === activeName"
                class="relative flex shrink-0 items-center border-t-2 px-3 py-2 text-sm font-semibold whitespace-nowrap"
                :class="
                  f.name === activeName
                    ? 'border-primary bg-surface text-fg'
                    : 'border-transparent text-muted hover:bg-surface/60 hover:text-fg'
                "
              >
                <input
                  v-if="renaming === f.name && renameWhere === 'tabs'"
                  ref="tabsRenameInput"
                  v-model="renameDraft"
                  class="w-28 bg-transparent font-mono text-sm text-fg outline-none"
                  :aria-label="t('fpga.renameHint')"
                  @click.stop
                  @keydown="onRenameKey"
                  @blur="commitRename"
                >
                <button
                  v-else
                  type="button"
                  class="bg-transparent p-0 font-semibold text-inherit"
                  :title="t('fpga.renameHint')"
                  @click="activeName = f.name"
                  @dblclick.prevent.stop="beginRename(f.name, 'tabs')"
                >
                  {{ f.name }}
                </button>
                <span
                  class="ml-2 text-muted hover:text-error"
                  :title="t('fpga.closeTab')"
                  @click.stop="onCloseTab(f.name)"
                >×</span>
              </div>
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
              <div data-fpga-drop class="relative">
                <button
                  type="button"
                  class="inline-flex h-[25px] cursor-pointer items-center rounded-md border border-border bg-surface px-2 text-xs font-semibold text-fg hover:bg-surface-2 max-md:h-8"
                  :title="t('tools.menuHint')"
                  @click="toggleMenu('tools')"
                >
                  {{ t('tools.menu') }} ▾
                </button>
                <div v-if="openMenu === 'tools'" :class="dropMenuEnd">
                  <button type="button" :class="dropItem" @click="onShare">
                    {{ t('tools.share') }}
                  </button>
                  <button
                    v-if="fsSupported"
                    type="button"
                    :class="dropItem"
                    @click="onOpenFolder"
                  >
                    {{ t('tools.openFolder') }}
                  </button>
                  <button
                    v-if="fsSupported"
                    type="button"
                    :class="dropItem"
                    :disabled="!folderHandle"
                    :style="folderHandle ? '' : 'opacity:.4;cursor:default'"
                    @click="folderHandle && onSaveFolder()"
                  >
                    {{ folderName ? t('tools.saveFolderNamed', { name: folderName }) : t('tools.saveFolder') }}
                  </button>
                  <button
                    v-if="fsSupported && folderHandle"
                    type="button"
                    :class="dropItem"
                    @click="closeMenu(); closeFolder()"
                  >
                    {{ t('tools.closeFolder', { name: folderName }) }}
                  </button>
                  <div class="my-1 border-t border-border" />
                  <p class="px-3 pt-1 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
                    {{ t('tools.artifacts') }}
                  </p>
                  <button
                    v-for="name in ARTIFACT_NAMES"
                    :key="name"
                    type="button"
                    :class="dropItem"
                    :style="hasBitstream ? '' : 'opacity:.4;cursor:default'"
                    :title="t('tools.artifactHint_' + name.replace('.', '_'))"
                    @click="hasBitstream && onDownloadArtifact(name)"
                  >
                    {{ name }} <span class="text-muted">— {{ t('tools.artifactHint_' + name.replace('.', '_')) }}</span>
                  </button>
                  <div class="my-1 border-t border-border" />
                  <button type="button" :class="dropItem" @click="openPll">
                    {{ t('tools.pll') }}
                  </button>
                  <button type="button" :class="dropItem" @click="openBram">
                    {{ t('tools.icebram') }}
                  </button>
                  <button type="button" :class="dropItem" @click="onShowBinHex">
                    {{ t('tools.hexView') }}
                  </button>
                  <div class="my-1 border-t border-border" />
                  <p class="px-3 py-1 text-[0.6875rem] text-muted">
                    {{ t('offline.status', { state: t(`offline.state_${offlineStatusRef}`), size: formatBytes(offlineBytesRef) }) }}
                  </p>
                  <button type="button" :class="dropItem" @click="onClearOffline">
                    {{ t('offline.clear') }}
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="cursor-pointer rounded-md p-1.5 text-muted hover:bg-surface hover:text-error"
                :title="t('fpga.resetProject')"
                :aria-label="t('fpga.resetProject')"
                @click="askResetProject"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path
                    d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"
                  />
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
          <div class="min-h-0 flex-1 p-2 max-md:h-[50vh] md:max-desk:h-[62vh]">
            <VerilogEditor
              v-if="activeFile"
              :key="activeName"
              ref="editorRef"
              :model-value="activeFile.content"
              :font-size="editorFontPx"
              :language="editorLanguage"
              :marks="editorMarks"
              height-class="h-full min-h-0"
              @update:model-value="setActiveContent"
              @save="onEditorSave"
            />
            <p v-else class="p-4 text-sm text-muted">
              {{ t('fpga.noOpenTab') }}
            </p>
          </div>
        </div>
      </section>

      <section class="flex min-h-0 min-w-0 shrink-0 flex-col gap-2 max-desk:w-full max-desk:flex-none max-desk:shrink desk:w-[calc(35%+50px)]">
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
        <div class="flex min-h-0 flex-1 flex-col gap-2 max-desk:flex-none">
          <div class="flex min-h-0 flex-[1.2] flex-col overflow-hidden rounded-xl border border-border bg-surface max-desk:h-64 max-desk:flex-none">
            <div class="relative z-20 shrink-0 border-b border-border px-2 py-1.5">
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
                  <SwapLabel
                    :options="[t('fpga.connectProgrammer'), t('fpga.connectingProgrammer')]"
                    :index="usbAction === 'connect' ? 1 : 0"
                  />
                </AppButton>
                <AppButton
                  size="sm"
                  variant="outline"
                  :class="slimBtn"
                  :disabled="usbBusy || !boardConnected"
                  :title="t('fpga.disconnectProgrammerHint')"
                  @click="onDisconnect"
                >
                  <SwapLabel
                    :options="[t('fpga.disconnectProgrammer'), t('fpga.closingProgrammer')]"
                    :index="usbAction === 'disconnect' ? 1 : 0"
                  />
                </AppButton>
                <AppButton
                  v-if="showReconnect"
                  size="sm"
                  variant="outline"
                  :class="slimBtn"
                  :disabled="usbBusy"
                  :title="t('fpga.reconnectHint')"
                  @click="onReconnect"
                >
                  <SwapLabel
                    :options="[t('fpga.reconnect'), t('fpga.reconnecting')]"
                    :index="usbAction === 'reconnect' ? 1 : 0"
                  />
                </AppButton>
                <!-- Reset vive con conectar/desconectar: es de la placa, no del
                     flujo de compilar y grabar. Así la fila de abajo entra en una. -->
                <AppButton
                  size="sm"
                  variant="outline"
                  :class="slimBtn"
                  :disabled="usbBusy"
                  :title="t('fpga.resetHint')"
                  @click="onReset"
                >
                  {{ t('fpga.reset') }}
                </AppButton>
                <div class="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    class="text-xs font-semibold text-muted hover:text-fg disabled:opacity-30"
                    :disabled="!logText"
                    :title="t('fpga.exportConsoleHint')"
                    @click="onExportLog"
                  >
                    {{ t('fpga.exportConsole') }}
                  </button>
                  <button
                    type="button"
                    class="text-xs font-semibold text-muted hover:text-fg disabled:opacity-30"
                    :disabled="!logText"
                    @click="clearLog"
                  >
                    {{ t('fpga.clearConsole') }}
                  </button>
                </div>
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <!-- Un botón, dos roles: mientras compila, el mismo cancela. -->
                <AppButton
                  size="sm"
                  :class="slimBtn"
                  :disabled="!busyCompile && usbBusy"
                  :title="busyCompile ? t('ide.cancelHint') : t('fpga.compileHint')"
                  @click="busyCompile ? onCancelCompile() : onCompile()"
                >
                  <SwapLabel
                    :options="[t('fpga.compile'), t('fpga.compilingCancel')]"
                    :index="busyCompile ? 1 : 0"
                  />
                </AppButton>
                <div data-fpga-drop class="relative">
                  <button
                    type="button"
                    class="inline-flex h-[25px] cursor-pointer items-center rounded-md border border-border bg-surface-2 px-2 text-xs font-semibold text-fg hover:bg-surface-3 max-md:h-8"
                    :class="usbBusy || uiLocked ? 'pointer-events-none opacity-60' : ''"
                    @click="toggleMenu('flash')"
                  >
                    <SwapLabel
                      :options="[t('fpga.flash'), t('fpga.flashing')]"
                      :index="usbAction === 'program' ? 1 : 0"
                    />
                  </button>
                  <div v-if="openMenu === 'flash'" :class="dropMenuStart">
                    <button type="button" :class="dropItem" @click="onFlashCompiled">
                      {{ t('fpga.flashCompiled') }}
                    </button>
                    <button type="button" :class="dropItem" @click="onFlashUpload">
                      {{ t('fpga.flashUpload') }}
                    </button>
                    <div class="my-1 border-t border-border" />
                    <button type="button" :class="dropItem" @click="onVerifyFlash">
                      {{ t('ide.verify') }}
                    </button>
                    <label class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-surface-2">
                      <input v-model="autoVerifyRef" type="checkbox" class="accent-primary">
                      {{ t('ide.autoVerify') }}
                    </label>
                  </div>
                </div>
                <div data-fpga-drop class="relative">
                  <button
                    type="button"
                    class="inline-flex h-[25px] cursor-pointer items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 max-md:h-8"
                    :class="usbBusy || uiLocked ? 'pointer-events-none opacity-60' : ''"
                    :title="t('fpga.sramHint')"
                    @click="toggleMenu('sram')"
                  >
                    <SwapLabel
                      :options="[t('fpga.sram'), t('fpga.sramming')]"
                      :index="usbAction === 'sram' ? 1 : 0"
                    />
                  </button>
                  <div v-if="openMenu === 'sram'" :class="dropMenuStart">
                    <button type="button" :class="dropItem" @click="onSramCompiled">
                      {{ t('fpga.sramCompiled') }}
                    </button>
                    <button type="button" :class="dropItem" @click="onSramUpload">
                      {{ t('fpga.sramUpload') }}
                    </button>
                  </div>
                </div>
                <AppButton size="sm" variant="outline" :class="slimBtn" :disabled="usbBusy" @click="onErase">
                  <SwapLabel
                    :options="[t('fpga.eraseFlash'), t('fpga.erasing')]"
                    :index="usbAction === 'erase' ? 1 : 0"
                  />
                </AppButton>
                <div data-fpga-drop class="relative">
                  <button
                    type="button"
                    class="inline-flex h-[25px] cursor-pointer items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 max-md:h-8"
                    :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                    @click="toggleMenu('read')"
                  >
                    <SwapLabel
                      :options="[t('fpga.readFlash'), t('fpga.reading')]"
                      :index="usbAction === 'read' ? 1 : 0"
                    />
                  </button>
                  <div v-if="openMenu === 'read'" :class="dropMenuEnd">
                    <button type="button" :class="dropItem" @click="onReadFlash('bin')">{{ t('fpga.readDownloadBin') }}</button>
                    <button type="button" :class="dropItem" @click="onReadFlash('hex')">{{ t('fpga.readDownloadHex') }}</button>
                    <button type="button" :class="dropItem" @click="onReadFlash('console')">{{ t('fpga.readShowConsole') }}</button>
                  </div>
                </div>
                <div data-fpga-drop class="relative">
                  <button
                    type="button"
                    class="inline-flex h-[25px] cursor-pointer items-center rounded-md border border-border-strong bg-transparent px-2 text-xs font-semibold text-fg hover:bg-surface-2 max-md:h-8"
                    :class="usbBusy ? 'pointer-events-none opacity-60' : ''"
                    :title="t('fpga.readEepromHint')"
                    @click="toggleMenu('eeprom')"
                  >
                    <SwapLabel
                      :options="[t('fpga.readEeprom'), t('fpga.eepromBusy')]"
                      :index="usbAction === 'eeprom' ? 1 : 0"
                    />
                  </button>
                  <div v-if="openMenu === 'eeprom'" :class="dropMenuEnd">
                    <button type="button" :class="dropItem" @click="onReadEeprom('bin')">{{ t('fpga.readDownloadBin') }}</button>
                    <button type="button" :class="dropItem" @click="onReadEeprom('hex')">{{ t('fpga.readDownloadHex') }}</button>
                    <button type="button" :class="dropItem" @click="onReadEeprom('console')">{{ t('fpga.readShowConsole') }}</button>
                  </div>
                </div>
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
            <div class="flex shrink-0 items-center gap-1 border-b border-border px-2" role="tablist">
              <button
                v-for="tab in (['log', 'problems', 'resources'] as RightTab[])"
                :key="tab"
                type="button"
                role="tab"
                :aria-selected="rightTab === tab"
                class="cursor-pointer border-b-2 px-2 py-1.5 text-xs font-semibold"
                :class="
                  rightTab === tab
                    ? 'border-primary text-fg'
                    : 'border-transparent text-muted hover:text-fg'
                "
                @click="rightTab = tab"
              >
                {{ t(`ide.tab_${tab}`) }}
                <span
                  v-if="tab === 'problems' && problems.length"
                  class="ml-1 rounded px-1 text-[0.625rem]"
                  :class="problemCounts.errors ? 'bg-error/15 text-error' : 'bg-warning/20 text-warning'"
                >{{ problems.length }}</span>
              </button>
              <!-- El estado de la revisión: dice si lo que ves está al día y
                   corre una nueva con un click. Reemplaza al botón Revisar. -->
              <button
                type="button"
                class="ml-auto inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] hover:bg-surface-2 disabled:cursor-default"
                :class="{
                  'text-muted': checkState !== 'clean',
                  'text-success': checkState === 'clean',
                }"
                :disabled="checking || busyCompile"
                :title="t('ide.checkHint')"
                @click="onCheck(true)"
              >
                <span
                  class="inline-block h-1.5 w-1.5 rounded-full"
                  :class="{
                    'bg-warning': checkState === 'stale',
                    'bg-primary': checkState === 'checking',
                    'bg-success': checkState === 'clean',
                  }"
                  aria-hidden="true"
                />
                <SwapLabel
                  :options="[t('ide.stateStale'), t('ide.stateChecking'), t('ide.stateClean')]"
                  :index="checkState === 'checking' ? 1 : checkState === 'clean' ? 2 : 0"
                />
              </button>
              <label
                class="flex cursor-pointer items-center gap-1 text-[0.6875rem] text-muted"
                :title="t('ide.autoCheckHint')"
              >
                <input v-model="autoCheckRef" type="checkbox" class="accent-primary">
                {{ t('ide.autoCheck') }}
              </label>
            </div>
            <div v-show="rightTab === 'log'" ref="logEl" class="min-h-0 flex-1 overflow-y-auto">
              <pre class="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">{{
                logText || t('fpga.logEmpty')
              }}</pre>
              <a
                v-if="compileBinLink && binObjectUrl"
                class="block px-3 pb-3 font-mono text-xs text-primary underline"
                :href="binObjectUrl"
                :download="compileBinLink.name"
                :title="t('fpga.downloadBinHint')"
              >{{ t('fpga.binConsoleLink', { name: compileBinLink.name, n: compileBinLink.n }) }}</a>
            </div>
            <ProblemsPanel
              v-if="rightTab === 'problems'"
              :items="problems"
              :checking="checking"
              @select="openProblem"
            />
            <ResourcePanel
              v-if="rightTab === 'resources'"
              :report="report"
              :stat="stat"
              :history="buildHistory"
              :constrained="constrainedClocks"
            />
          </div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface max-desk:h-52 max-desk:flex-none">
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
                class="h-[25px] rounded-md border border-border bg-surface-2 px-1.5 font-mono text-xs max-md:h-8"
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
                <SwapLabel
                  :options="[t('fpga.connectUart'), t('fpga.connectingUart')]"
                  :index="uartBusy && !uartConnected ? 1 : 0"
                />
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
                :disabled="!uartView"
                @click="clearUart"
              >
                {{ t('fpga.clearConsole') }}
              </button>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-2 py-1">
              <label class="flex cursor-pointer items-center gap-1 text-[0.6875rem] text-muted">
                <input v-model="uartTimestampsRef" type="checkbox" class="accent-primary">
                {{ t('uart.timestamps') }}
              </label>
              <label class="flex cursor-pointer items-center gap-1 text-[0.6875rem] text-muted">
                <input v-model="uartHexRef" type="checkbox" class="accent-primary">
                {{ t('uart.hex') }}
              </label>
              <label
                class="flex cursor-pointer items-center gap-1 text-[0.6875rem] text-muted"
                :title="t('uart.plotHint')"
              >
                <input v-model="showPlot" type="checkbox" class="accent-primary">
                {{ t('uart.plot') }}
              </label>
              <button
                type="button"
                class="ml-auto text-[0.6875rem] font-semibold text-muted hover:text-fg disabled:opacity-30"
                :disabled="!uartView"
                @click="saveUartLog"
              >
                {{ t('uart.saveLog') }}
              </button>
            </div>
            <UartPlot
              v-if="showPlot"
              :series="plotSeries"
              :version="plotVersion"
              class="min-h-[6rem]"
            />
            <div v-show="!showPlot" ref="uartEl" class="min-h-0 flex-1 overflow-y-auto">
              <pre class="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">{{
                uartView || t('fpga.uartEmpty')
              }}</pre>
            </div>
            <form
              class="flex shrink-0 items-center gap-1.5 border-t border-border px-2 py-1.5"
              @submit.prevent="sendUart"
            >
              <input
                v-model="uartInput"
                class="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-fg"
                :placeholder="t('uart.sendPlaceholder')"
                :disabled="!uartConnected"
                @keydown="onUartInputKey"
              >
              <select
                v-model="uartEnding"
                class="h-[25px] rounded-md border border-border bg-surface-2 px-1 font-mono text-[0.6875rem] max-md:h-8"
                :title="t('uart.endingHint')"
              >
                <option v-for="e in UART_LINE_ENDINGS" :key="e" :value="e">{{ t(`uart.ending_${e}`) }}</option>
              </select>
              <AppButton
                size="sm"
                type="submit"
                :class="slimBtn"
                :disabled="!uartConnected || !uartInput"
              >
                {{ t('uart.send') }}
              </AppButton>
            </form>
          </div>
        </div>
      </section>
    </div>

    <footer class="shrink-0 border-t border-border px-4 py-1.5 text-center text-[0.8125rem] leading-relaxed text-muted max-md:px-3 max-md:text-xs">
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
        <p class="mt-3 text-sm leading-relaxed text-muted">{{ t('app.firefoxSerial') }}</p>
        <a
          class="mt-2 inline-block text-sm text-primary underline"
          :href="webserialAddonUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('app.firefoxSerialLink') }}</a>
        <p class="mt-1 break-all text-xs text-muted">{{ webserialAddonUrl }}</p>
        <div class="mt-4">
          <AppButton @click="dismissFirefoxNotice">{{ t('app.firefoxAccept') }}</AppButton>
        </div>
      </div>
    </div>
    <HelpModal :open="showHelp" @close="showHelp = false" />
    <BoardHelpModal :board="helpBoard" @close="helpBoard = null" />
    <PcfIssueModal
      :issue="pcfIssue"
      :board-title="activeBoard.title"
      :board-pcf="activeBoard.starterPcf"
      :pcf-name="PROJECT_PCF"
      @add="addBoardPcfToProject"
      @close="pcfIssue = null"
    />
    <ConfirmModal
      :open="showResetConfirm"
      :title="t('fpga.resetProjectTitle')"
      :body="t('fpga.resetProjectBody', { name: activeBoard.title })"
      :confirm-label="t('fpga.resetProjectConfirm')"
      @confirm="resetProject"
      @close="showResetConfirm = false"
    />
    <CustomBoardModal
      :open="showCustomModal"
      :initial="customDraft"
      @save="onCustomSave"
      @close="showCustomModal = false"
    />
    <ExportProjectModal
      :open="showExportModal"
      :initial-name="top.trim().replace(/\.v$/i, '') || 'top_module'"
      @export="handleConfirmExport"
      @close="showExportModal = false"
    />
    <PllModal
      :open="showPll"
      :busy="pllBusy"
      :default-input-mhz="12"
      :summary="pllSummary"
      :verilog="pllVerilog"
      :error="pllError"
      @run="onPllRun"
      @add="onPllAdd"
      @close="showPll = false"
    />
    <IcebramModal
      :open="showBram"
      :busy="bramBusy"
      :hex-files="hexFiles"
      :has-bitstream="hasBitstream"
      :error="bramError"
      :note="bramNote"
      @run="onBramRun"
      @generate="onBramGenerate"
      @close="showBram = false"
    />
    <ShareModal
      :open="showShare"
      :url="shareUrl"
      :file-count="files.length"
      @close="showShare = false"
    />
    <HexViewModal
      :open="showHexView"
      :title="hexTitle"
      :data="hexData"
      @close="showHexView = false"
    />
    <ConfirmModal
      :open="showRemoveProject"
      :title="t('project.removeTitle')"
      :body="t('project.removeBody', { name: currentProjectName })"
      :confirm-label="t('project.removeConfirm')"
      @confirm="removeProject"
      @close="showRemoveProject = false"
    />
    <ConfirmModal
      :open="pendingShare != null"
      :title="t('share.openTitle')"
      :body="t('share.openBody', { n: pendingShare?.files.length ?? 0 })"
      :confirm-label="t('share.openConfirm')"
      @confirm="acceptShared"
      @close="pendingShare = null"
    />
  </div>
</template>
