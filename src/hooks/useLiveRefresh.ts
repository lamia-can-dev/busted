import { useEffect, useRef } from 'react'

/**
 * Keeps data fresh by:
 * 1. Polling at a regular interval (default 8s)
 * 2. Refetching immediately when the tab becomes visible again
 *
 * The callback should be the data-loading function (e.g. loadGrid, loadScores).
 * It won't fire the initial load — call your loader yourself on mount.
 */
export function useLiveRefresh(callback: () => void, intervalMs = 8000) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    // Poll at regular intervals
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') cbRef.current()
    }, intervalMs)

    // Refetch immediately when tab regains focus
    function onVisibility() {
      if (document.visibilityState === 'visible') cbRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
}
