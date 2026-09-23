import { useCallback, useEffect, useRef, useState } from "react"

import { DocumentItem } from "../types"

import { pollDocumentStatusApi } from "../services/api"

const DEFAULT_INTERVAL_MS = 3000

/** ~30 minutes at a 3s interval; guards against polling forever when the
 * backend can never finish (deleted doc, server down, etc). */

const DEFAULT_MAX_ATTEMPTS = 600

interface PollTimersEntry {
  timer: ReturnType<typeof setInterval>

  attempts: number
}

type PollOutcome = { type: "finished" doc: DocumentItem } | {
  type: "timeout"
  docId: string | number
}

/**
 * Managed status polling for background AI jobs.
 *
 * Fixes over the previous inline implementation:
 * - Intervals are tracked and cleared on unmount, on manual stop(), and when
 *   the job finishes — no more leaked intervals.
 * - Attempt cap stops infinite polling against permanently-failing requests.
 * - Pauses while the tab is hidden (document.hidden), matching the UI copy.
 */

export function useDocumentPolling(
  onOutcome: (outcome: PollOutcome) => void,

  intervalMs = DEFAULT_INTERVAL_MS,

  maxAttempts = DEFAULT_MAX_ATTEMPTS,
) {
  const timersRef = useRef<Map<string | number, PollTimersEntry>>(new Map())

  const outcomeRef = useRef(onOutcome)

  outcomeRef.current = onOutcome

  const stop = useCallback((docId: string | number) => {
    const entry = timersRef.current.get(docId)

    if (entry) {
      clearInterval(entry.timer)

      timersRef.current.delete(docId)
    }
  }, [])

  const start = useCallback(
    (docId: string | number) => {
      if (timersRef.current.has(docId)) return

      const entry: PollTimersEntry = {
        attempts: 0,

        timer: null as unknown as ReturnType<typeof setInterval>,
      }

      entry.timer = setInterval(
        async () => {
          // Skip ticks while hidden; the next visible tick will catch up.

          if (typeof document !== "undefined" && document.hidden) return

          entry.attempts += 1

          if (entry.attempts > maxAttempts) {
            stop(docId)

            outcomeRef.current({ type: "timeout", docId })

            return
          }

          const updated = await pollDocumentStatusApi(docId)

          if (!updated) return // transient failure — keep trying until cap

          if (updated.status !== "Processing") {
            stop(docId)

            outcomeRef.current({ type: "finished", doc: updated })
          }
        },
        intervalMs,
      )

      timersRef.current.set(docId, entry)
    },

    [intervalMs, maxAttempts, stop],
  )

  const stopAll = useCallback(() => {
    for (const [, entry] of timersRef.current) clearInterval(entry.timer)

    timersRef.current.clear()
  }, [])

  // Cleanup every pending interval on unmount.

  useEffect(() => {
    const timers = timersRef.current

    return () => {
      for (const [, entry] of timers) clearInterval(entry.timer)

      timers.clear()
    }
  }, [])

  return { start, stop, stopAll }
}
