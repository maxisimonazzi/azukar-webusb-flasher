<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { plotBounds, type PlotSeries } from '@/fpga/uartView'

const props = defineProps<{
  series: PlotSeries
  /** Cambia en cada muestra nueva: dispara el redibujo. */
  version: number
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let frame: number | null = null

/** Colores de las series: se leen del tema para no pelear con la paleta. */
const LINE_VARS = ['--primary', '--success', '--info', '--warning', '--error']

function cssVar(name: string, fallback: string): string {
  const el = canvas.value
  if (!el) return fallback
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  return value || fallback
}

function draw() {
  frame = null
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const width = el.clientWidth
  const height = el.clientHeight
  if (width === 0 || height === 0) return
  if (el.width !== width * dpr || el.height !== height * dpr) {
    el.width = width * dpr
    el.height = height * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const rows = props.series.rows.filter((row) => row.length > 0)
  if (rows.length === 0) return

  const { min, max } = plotBounds(props.series)
  const span = max - min || 1
  const pad = 4
  const usable = height - pad * 2
  const longest = Math.max(...rows.map((r) => r.length))
  const stepX = longest > 1 ? width / (longest - 1) : width

  // Línea del cero, si entra en el rango.
  if (min < 0 && max > 0) {
    ctx.strokeStyle = cssVar('--border', '#888')
    ctx.lineWidth = 1
    const y = pad + usable - ((0 - min) / span) * usable
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  rows.forEach((row, index) => {
    ctx.strokeStyle = cssVar(LINE_VARS[index % LINE_VARS.length] ?? '--primary', '#f90')
    ctx.lineWidth = 1.5
    ctx.beginPath()
    row.forEach((value, i) => {
      if (!Number.isFinite(value)) return
      const x = i * stepX
      const y = pad + usable - ((value - min) / span) * usable
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  })

  ctx.fillStyle = cssVar('--muted', '#999')
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillText(max.toFixed(2), 4, 11)
  ctx.fillText(min.toFixed(2), 4, height - 3)
}

function schedule() {
  if (frame == null) frame = requestAnimationFrame(draw)
}

watch(() => props.version, schedule)
onMounted(() => {
  schedule()
  window.addEventListener('resize', schedule)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', schedule)
  if (frame != null) cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <canvas ref="canvas" class="min-h-0 w-full flex-1" />
    <div class="flex flex-wrap gap-3 px-3 pb-2">
      <span
        v-for="(label, i) in series.labels"
        :key="`${label}-${i}`"
        class="flex items-center gap-1 font-mono text-[0.6875rem] text-muted"
      >
        <span
          class="inline-block h-2 w-2 rounded-full"
          :style="{ backgroundColor: `var(${LINE_VARS[i % LINE_VARS.length]})` }"
        />
        {{ label }}
      </span>
    </div>
  </div>
</template>
