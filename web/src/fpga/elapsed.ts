/** One closing line per long task, always the same shape, in the lab console. */

export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** ms → "820 ms" / "3.41 s" / "1 min 12.3 s". Readable, not scientific. */
export function formatDuration(ms: number): string {
  const t = Math.max(0, ms)
  if (t < 1000) return `${Math.round(t)} ms`
  const s = t / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`
  const min = Math.floor(s / 60)
  return `${min} min ${(s - min * 60).toFixed(1)} s`
}

/** Bytes moved per second, for the tasks that move bytes. */
export function formatThroughput(bytes: number, ms: number): string {
  if (bytes <= 0 || ms <= 0) return ''
  const kbps = bytes / 1024 / (ms / 1000)
  return kbps >= 1024
    ? `${(kbps / 1024).toFixed(2)} MiB/s`
    : `${kbps.toFixed(1)} KiB/s`
}

export function elapsedLine(
  task: string,
  ms: number,
  opts?: { bytes?: number; failed?: boolean },
): string {
  const rate = opts?.bytes ? formatThroughput(opts.bytes, ms) : ''
  const tail = rate ? ` (${rate})` : ''
  const mark = opts?.failed ? ' — cortado por un error' : ''
  return `[tiempo] ${task}: ${formatDuration(ms)}${tail}${mark}`
}
