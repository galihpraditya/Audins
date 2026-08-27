import { useCallback, useState } from "react"
import { QuotaSnapshot } from "../types"
import { fetchRateLimitApi } from "../services/api"

const DEFAULT_STORAGE_LIMIT = 500 * 1024 * 1024

const INITIAL: QuotaSnapshot = {
  uploadCount: 0,
  maxUploads: 10,
  storageUsed: 0,
  storageLimit: DEFAULT_STORAGE_LIMIT,
  resetTime: "",
}

/**
 * Server-backed quota state (daily uploads + storage).
 * `refresh()` re-syncs from the backend; call it after uploads, deletes and
 * processing completions so the sidebar never drifts from server truth.
 */
export function useQuota() {
  const [quota, setQuota] = useState<QuotaSnapshot>(INITIAL)

  const refreshFromServer = useCallback(async () => {
    try {
      const status = await fetchRateLimitApi()
      if (status && status.maxLimit && typeof status.remaining === "number") {
        setQuota((prev) => ({
          ...prev,
          uploadCount: status.maxLimit - status.remaining,
          maxUploads: status.maxLimit,
          resetTime: status.resetTime || prev.resetTime,
          storageUsed:
            status.storageUsed !== undefined ? status.storageUsed : prev.storageUsed,
          storageLimit:
            status.storageLimit !== undefined
              ? status.storageLimit
              : prev.storageLimit,
        }))
      }
    } catch {
      // Non-critical UI data — keep previous values on failure.
    }
  }, [])

  /** Optimistic local bump; pair with rollback() when an upload fails. */
  const bumpUploadCount = useCallback(() => {
    setQuota((prev) => ({ ...prev, uploadCount: prev.uploadCount + 1 }))
  }, [])

  const rollbackUploadCount = useCallback(() => {
    setQuota((prev) => ({
      ...prev,
      uploadCount: Math.max(0, prev.uploadCount - 1),
    }))
  }, [])

  return { quota, refreshFromServer, bumpUploadCount, rollbackUploadCount }
}
