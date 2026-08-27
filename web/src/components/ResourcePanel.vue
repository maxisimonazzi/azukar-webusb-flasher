<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  fmaxFails,
  utilisationPct,
  type BuildRecord,
  type PnrReport,
  type YosysStat,
} from '@/fpga/pnrReport'

const props = defineProps<{
  report: PnrReport | null
  stat: YosysStat | null
  history: BuildRecord[]
  /** Relojes con `set_frequency` en el PCF: el resto usa el default de nextpnr. */
  constrained: string[]
}>()

/** Sin `set_frequency`, nextpnr compara contra 12 MHz y el PASA no dice nada. */
function isConstrained(clock: string): boolean {
  return props.constrained.includes(clock)
}

const { t } = useI18n()

/** Las filas que importan primero; el resto va abajo igual. */
const ORDER = ['ICESTORM_LC', 'ICESTORM_RAM', 'SB_IO', 'SB_GB', 'ICESTORM_PLL', 'SB_WARMBOOT']

const rows = computed(() => {
  const list = props.report?.utilisation ?? []
  return [...list].sort((a, b) => {
    const ia = ORDER.indexOf(a.name)
    const ib = ORDER.indexOf(b.name)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
})

function barClass(pct: number): string {
  if (pct >= 90) return 'bg-error'
  if (pct >= 70) return 'bg-warning'
  return 'bg-primary'
}

function clock(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    <p v-if="!report && !stat" class="font-mono text-xs text-muted">
      {{ t('ide.noReport') }}
    </p>

    <template v-else>
      <div v-if="report && report.fmax.length" class="mb-3">
        <p class="mb-1 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('ide.timing') }}
        </p>
        <div
          v-for="entry in report.fmax"
          :key="entry.clock"
          class="flex flex-wrap items-baseline gap-x-2 font-mono text-xs"
          :class="isConstrained(entry.clock) && fmaxFails(entry) ? 'text-error' : 'text-fg'"
        >
          <span class="font-semibold">{{ entry.clock }}</span>
          <span>{{ entry.achieved.toFixed(2) }} MHz</span>
          <template v-if="isConstrained(entry.clock)">
            <span class="text-muted">
              {{ t('ide.constraint', { n: entry.constraint.toFixed(2) }) }}
            </span>
            <span
              class="rounded px-1 py-0.5 text-[0.625rem] font-bold uppercase"
              :class="fmaxFails(entry) ? 'bg-error/15 text-error' : 'bg-success/15 text-success'"
            >{{ fmaxFails(entry) ? t('ide.fail') : t('ide.pass') }}</span>
          </template>
          <span v-else class="text-muted" :title="t('ide.noConstraintHint')">
            {{ t('ide.noConstraint', { n: entry.constraint.toFixed(2) }) }}
          </span>
        </div>
        <p
          v-if="report.fmax.some((f) => !isConstrained(f.clock))"
          class="mt-1 border-l-2 border-border-strong pl-2 text-[0.6875rem] leading-relaxed text-muted"
        >
          {{ t('ide.noConstraintHint') }}
        </p>
        <p v-if="report.criticalPathNs" class="mt-1 font-mono text-[0.6875rem] text-muted">
          {{ t('ide.criticalPath', { n: report.criticalPathNs.toFixed(2) }) }}
        </p>
      </div>

      <div v-if="rows.length" class="mb-3">
        <p class="mb-1 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('ide.utilisation') }}
        </p>
        <div v-for="row in rows" :key="row.name" class="mb-1.5">
          <div class="flex justify-between font-mono text-[0.6875rem]">
            <span class="text-fg">{{ row.name }}</span>
            <span class="text-muted">
              {{ row.used }} / {{ row.available }} ({{ utilisationPct(row).toFixed(0) }}%)
            </span>
          </div>
          <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              class="h-full transition-[width] duration-150"
              :class="barClass(utilisationPct(row))"
              :style="{ width: `${Math.max(utilisationPct(row), row.used > 0 ? 2 : 0)}%` }"
            />
          </div>
        </div>
      </div>

      <div v-if="stat" class="mb-3">
        <p class="mb-1 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('ide.cells', { module: stat.module, n: stat.totalCells }) }}
        </p>
        <div
          v-for="cell in stat.cells"
          :key="cell.name"
          class="flex justify-between font-mono text-[0.6875rem]"
        >
          <span class="text-fg">{{ cell.name }}</span>
          <span class="text-muted">{{ cell.count }}</span>
        </div>
      </div>

      <div v-if="history.length > 1">
        <p class="mb-1 text-[0.625rem] font-bold tracking-[0.14em] text-muted uppercase">
          {{ t('ide.history') }}
        </p>
        <div
          v-for="(record, i) in history"
          :key="`${record.at}-${i}`"
          class="flex flex-wrap justify-between gap-x-2 font-mono text-[0.6875rem] text-muted"
        >
          <span>{{ clock(record.at) }} · {{ record.top }}</span>
          <span>
            <template v-if="record.lcUsed != null">{{ record.lcUsed }} LC</template>
            <template v-if="record.fmax != null"> · {{ record.fmax.toFixed(1) }} MHz</template>
            <template v-if="record.bytes != null"> · {{ record.bytes }} B</template>
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
