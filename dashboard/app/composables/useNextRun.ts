/** Reactive countdown to next pipeline run (daily 09:00 Europe/Bratislava). */
export function useNextRun(status?: Ref<string | undefined>) {
  const TZ = 'Europe/Bratislava'
  const RUN_HOUR = 9

  function computeNext(): { nextRunAt: Date; relativeLabel: string } {
    const now = new Date()

    // Get current hour in Bratislava
    const bratislavaHour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now),
    )
    const bratislavaMinute = Number(
      new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: TZ }).format(now),
    )

    // Build next run date in Bratislava time
    // If past 09:00 today in Bratislava, next run is tomorrow
    const nextRun = new Date(now)
    if (bratislavaHour > RUN_HOUR || (bratislavaHour === RUN_HOUR && bratislavaMinute >= 0)) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    // Set to 09:00 Bratislava — approximate by adjusting from current offset
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    const dateStr = formatter.format(nextRun)
    const nextRunAt = new Date(`${dateStr}T09:00:00`)
    // Adjust for timezone offset difference
    const localOffset = nextRunAt.getTimezoneOffset()
    const bratislavaOffset = getBratislavaOffset(nextRunAt)
    nextRunAt.setMinutes(nextRunAt.getMinutes() + localOffset - bratislavaOffset)

    // Relative label
    const diffMs = nextRunAt.getTime() - now.getTime()
    if (diffMs <= 0) return { nextRunAt, relativeLabel: 'now' }

    const hours = Math.floor(diffMs / 3_600_000)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)

    let relativeLabel: string
    if (hours > 0) {
      relativeLabel = `in ${hours}h ${minutes}m`
    } else {
      relativeLabel = `in ${minutes}m`
    }

    return { nextRunAt, relativeLabel }
  }

  function getBratislavaOffset(date: Date): number {
    // Compute UTC offset for Europe/Bratislava at a given date
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
    const tzStr = date.toLocaleString('en-US', { timeZone: TZ })
    return (new Date(utcStr).getTime() - new Date(tzStr).getTime()) / 60_000
  }

  const nextRunAt = ref<Date>(new Date())
  const relativeLabel = ref('--')

  function update() {
    if (status?.value === 'running') {
      relativeLabel.value = 'Running now'
      return
    }
    const result = computeNext()
    nextRunAt.value = result.nextRunAt
    relativeLabel.value = result.relativeLabel
  }

  update()
  const interval = setInterval(update, 60_000)
  onUnmounted(() => clearInterval(interval))

  return { nextRunAt: readonly(nextRunAt), relativeLabel: readonly(relativeLabel) }
}
