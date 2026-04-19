/**
 * Fire `fn` every `intervalMs` while the tab is visible AND `shouldRun` is true.
 * Pauses automatically when the tab is hidden, resumes on visibility change.
 * Cleans up on unmount.
 */
export function useVisiblePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  shouldRun: () => boolean = () => true,
) {
  let timer: ReturnType<typeof setInterval> | undefined

  function start() {
    if (timer || !shouldRun()) return
    timer = setInterval(() => {
      if (!shouldRun()) {
        stop()
        return
      }
      fn()
    }, intervalMs)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') start()
    else stop()
  }

  onMounted(() => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
  })

  onUnmounted(() => {
    stop()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })

  return { start, stop }
}
