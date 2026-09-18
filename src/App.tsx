import { useState, useEffect, useRef, useCallback } from "react"
import { Routes, Route, useNavigate, Navigate } from "react-router-dom"
import { DocumentItem, RetranscribeOptions } from "./types"
import Sidebar from "./components/layout/Sidebar"
import MobileNav from "./components/layout/MobileNav"
import TopHeader from "./components/layout/TopHeader"
import Dashboard from "./components/dashboard/Dashboard"
import Workspace from "./components/workspace/Workspace"
import SettingsPage from "./pages/Settings"
import LiveRecorderModal from "./components/recording/LiveRecorderModal"
import RateLimitModal from "./components/modals/RateLimitModal"
import AuthModal from "./components/modals/AuthModal"
import { useAuth } from "./context/AuthContext"
import {
  uploadAudioToApi,
  reSummarizeApi,
  fetchDocumentsFromApi,
  deleteDocumentApi,
  deleteAudioOnlyApi,
  retranscribeDocumentApi,
  renameDocumentApi,
  duplicateDocumentApi,
  updateDocumentSummaryApi,
  ApiError,
} from "./services/api"
import { useToast } from "./components/ui/ToastContext"
import Alert from "./components/ui/Alert"
import { useLanguage } from "./context/LanguageContext"
import { useApiKey } from "./hooks/useApiKey"
import { useQuota } from "./hooks/useQuota"
import { useDocumentPolling } from "./hooks/useDocumentPolling"
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react"

export default function App() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t, language } = useLanguage()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [rateModalOpen, setRateModalOpen] = useState<boolean>(false)
  const [liveRecorderOpen, setLiveRecorderOpen] = useState<boolean>(false)
  const [liveRecorderMinimized, setLiveRecorderMinimized] = useState<boolean>(false)

  const handleOpenLiveRecorder = useCallback(() => {
    setLiveRecorderMinimized(false)
    setLiveRecorderOpen(true)
  }, [])
  const {
    authModalOpen,
    authModalTab,
    closeAuthModal,
    registerSyncListener,
    user,
  } = useAuth()

  // Document collection state
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loadError, setLoadError] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const uploadControllersRef = useRef<Map<string | number, AbortController>>(new Map())
  // Temp blob URLs (local preview before the backend returns a real audioUrl).
  const tempBlobUrlsRef = useRef<Map<string | number, string>>(new Map())
  // Uploads cancelled while in flight — guards the async success path from
  // navigating/polling for a doc the user already discarded.
  const cancelledUploadsRef = useRef<Set<string | number>>(new Set())

  /** True when an error represents a quota/rate-limit condition. */
  const isQuotaError = (err: unknown): boolean => {
    if (err instanceof ApiError) {
      if (err.status === 429 || err.status === 402 || err.status === 503) return true
    }
    const message = (err as Error).message?.toLowerCase() || ""
    return (
      message.includes("api key") ||
      message.includes("quota service") ||
      message.includes("rate limit")
    )
  }

  const { userApiKey, saveApiKey, apiKeyStatus, hasCustomKey } = useApiKey()
  const { quota, refreshFromServer, bumpUploadCount, rollbackUploadCount } = useQuota()

  const revokeTempBlob = useCallback((id: string | number) => {
    const url = tempBlobUrlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      tempBlobUrlsRef.current.delete(id)
    }
  }, [])

  const handlePollOutcome = useCallback(
    (
      outcome:
        | { type: "finished"; doc: DocumentItem }
        | { type: "timeout"; docId: string | number },
    ) => {
      if (outcome.type === "finished") {
        const updated = outcome.doc
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))

        if (updated.status === "Completed") {
          showToast(t("toast_processing_done", { name: updated.name }), "success")
          revokeTempBlob(updated.id)
        } else {
          showToast(t("toast_processing_failed", { name: updated.name }), "error")
        }
      } else {
        // Give up: flip the doc to Failed so it stops spinning forever, and
        // release the local preview blob.
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === outcome.docId ? { ...d, status: "Failed" as const } : d,
          ),
        )
        revokeTempBlob(outcome.docId)
        showToast(t("toast_polling_timeout"), "error")
      }
      // Re-sync storage info after processing settles.
      void refreshFromServer()
    },
    [showToast, t, refreshFromServer, revokeTempBlob],
  )

  const { start: startPolling, stop: stopPolling } = useDocumentPolling(handlePollOutcome)

  // Prevent default browser behavior for drag & drop globally to avoid unintended downloads
  useEffect(() => {
    const preventDefault = (e: globalThis.DragEvent) => {
      e.preventDefault()
    }
    window.addEventListener("dragover", preventDefault, false)
    window.addEventListener("drop", preventDefault, false)
    return () => {
      window.removeEventListener("dragover", preventDefault, false)
      window.removeEventListener("drop", preventDefault, false)
    }
  }, [])

  // Fetch initial documents and rate limit from backend
  const loadInitialData = useCallback(async () => {
    setLoadError(false)
    setInitialLoading(true)
    try {
      const docs = await fetchDocumentsFromApi()
      const sortedDocs = [...docs].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      setDocuments(sortedDocs)
      // Resume status tracking for jobs that were still running server-side
      // (e.g. the user refreshed mid-processing) — otherwise the badge spins
      // forever even after the backend finishes.
      sortedDocs.forEach((d) => {
        if (d.status === "Processing") startPolling(d.id)
      })
    } catch {
      // Surface a visible error + retry instead of an ambiguous empty state.
      setLoadError(true)
    } finally {
      setInitialLoading(false)
    }
    await refreshFromServer()
  }, [refreshFromServer, startPolling])

  // Register loadInitialData as sync listener so cross-device triggers refresh UI
  useEffect(() => {
    return registerSyncListener(loadInitialData)
  }, [registerSyncListener, loadInitialData])

  // Reload when active user account changes (login/logout)
  useEffect(() => {
    void loadInitialData()
  }, [user?.id, loadInitialData])

  const handleUploadFile = async (file: File) => {
    // Check free demo quota against the server-provided max (not a hardcoded 10).
    if (!hasCustomKey && quota.uploadCount >= quota.maxUploads) {
      setRateModalOpen(true)
      return
    }

    // Check file size on frontend
    if (file.size > 500 * 1024 * 1024) {
      showToast(t("toast_upload_too_large"), "error")
      return
    }

    const blobUrl = URL.createObjectURL(file)
    const newId = Date.now()
    const nowStr = new Date().toLocaleDateString(
      language === "id" ? "id-ID" : "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    )

    // 1. Calculate audio duration using HTML5 Audio
    let durationSec = 30
    let durationStr = "0m 30s"

    try {
      const audio = new Audio(blobUrl)
      await new Promise<void>((resolve) => {
        const applyDuration = () => {
          durationSec = Math.floor(audio.duration)
          const m = Math.floor(durationSec / 60)
          const s = durationSec % 60
          durationStr = `${m}m ${s.toString().padStart(2, "0")}s`
        }
        audio.onloadedmetadata = () => {
          if (
            audio.duration &&
            !isNaN(audio.duration) &&
            audio.duration !== Infinity
          ) {
            applyDuration()
            resolve()
          } else if (audio.duration === Infinity) {
            audio.currentTime = Number.MAX_SAFE_INTEGER
            audio.ontimeupdate = () => {
              audio.ontimeupdate = null
              audio.currentTime = 0
              if (
                audio.duration &&
                !isNaN(audio.duration) &&
                audio.duration !== Infinity
              ) {
                applyDuration()
              }
              resolve()
            }
          } else {
            resolve()
          }
        }
        audio.onerror = () => resolve()
      })
    } catch {
      // Fallback duration
    }

    // Temporary processing doc
    const newDoc: DocumentItem = {
      id: newId,
      name: file.name,
      createdAt: nowStr,
      date: nowStr,
      duration: durationStr,
      durationSec,
      status: "Processing",
      audioUrl: blobUrl,
      transcripts: [],
      uploadProgress: 0,
    }

    tempBlobUrlsRef.current.set(newId, blobUrl)
    setDocuments((prev) => [newDoc, ...prev])
    bumpUploadCount() // optimistic; rolled back on failure below
    navigate(`/workspace/${newId}`)

    const controller = new AbortController()
    uploadControllersRef.current.set(newId, controller)

    // Throttle XHR progress updates to ~10/s so large uploads don't cause
    // dozens of full-array re-renders per second.
    let lastProgressUpdate = 0

    // 2. Try uploading to backend API or process AI
    try {
      const apiResult = await uploadAudioToApi(
        file,
        userApiKey,
        durationStr,
        durationSec,
        (progress) => {
          const now = performance.now()
          if (progress >= 100 || now - lastProgressUpdate > 100) {
            lastProgressUpdate = now
            setDocuments((prev) =>
              prev.map((d) =>
                d.id === newId ? { ...d, uploadProgress: progress } : d,
              ),
            )
          }
        },
        controller.signal,
      )

      // The user cancelled while the request was in flight (the abort landed
      // after the response resolved). Discard the result silently — the doc,
      // blob and quota were already handled by handleCancelUpload.
      if (cancelledUploadsRef.current.has(newId)) {
        cancelledUploadsRef.current.delete(newId)
        uploadControllersRef.current.delete(newId)
        return
      }
      uploadControllersRef.current.delete(newId)

      const processingDoc: DocumentItem = {
        ...apiResult,
        audioUrl: apiResult.audioUrl || blobUrl,
        uploadProgress: 100,
      }

      setDocuments((prev) =>
        prev.map((d) => (d.id === newId ? processingDoc : d)),
      )

      // The backend owns the media now — release our local preview copy.
      if (apiResult.audioUrl) revokeTempBlob(newId)

      // If backend returned a different id than temp newId, remap the blob ref
      if (String(apiResult.id) !== String(newId)) {
        navigate(`/workspace/${apiResult.id}`, { replace: true })
        const blob = tempBlobUrlsRef.current.get(newId)
        if (blob) {
          tempBlobUrlsRef.current.set(apiResult.id, blob)
          tempBlobUrlsRef.current.delete(newId)
        }
      }

      if (processingDoc.status === "Processing") {
        showToast(t("toast_processing_started"), "info")
        startPolling(apiResult.id)
      }
      return
    } catch (err) {
      uploadControllersRef.current.delete(newId)

      if ((err as Error).message === "Upload cancelled") {
        rollbackUploadCount()
        revokeTempBlob(newId)
        return
      }

      console.error("Upload failed:", err)
      rollbackUploadCount()
      setDocuments((prev) =>
        prev.map((d) => (d.id === newId ? { ...newDoc, status: "Failed" } : d)),
      )

      if (!hasCustomKey && isQuotaError(err)) {
        setRateModalOpen(true)
      } else {
        showToast(`Processing failed: ${(err as Error).message || "Unknown error"}`, "error")
      }
    }
  }

  const handleReSummarize = async (
    id: string | number,
    customPrompt?: string,
  ) => {
    if (!hasCustomKey && quota.uploadCount >= 5) {
      setRateModalOpen(true)
      return
    }

    const previousStatus =
      documents.find((d) => d.id === id)?.status ?? "Completed"

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "Processing" } : d)),
    )
    bumpUploadCount()

    try {
      const updatedDoc = await reSummarizeApi(id, userApiKey, customPrompt)
      setDocuments((prev) => prev.map((d) => (d.id === id ? updatedDoc : d)))
    } catch (err) {
      // Restore the REAL prior status instead of hardcoding "Completed".
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: previousStatus } : d)),
      )
      rollbackUploadCount()

      if (!hasCustomKey && isQuotaError(err)) {
        setRateModalOpen(true)
      } else {
        showToast(
          t("toast_resummarize_failed", { error: (err as Error).message || "Unknown error" }),
          "error",
        )
      }
    }
  }

  const handleDeleteDocument = async (id: number | string) => {
    const doc = documents.find((d) => d.id === id)
    try {
      await deleteDocumentApi(id)
      stopPolling(id)
      revokeTempBlob(id)
      setDocuments((prev) => prev.filter((doc) => doc.id !== id))
      if (doc) showToast(t("toast_deleted", { name: doc.name }), "success")
      void refreshFromServer()
    } catch (err) {
      showToast(t("toast_delete_failed", { error: (err as Error).message }), "error")
    }
  }

  const handleDeleteAudioOnly = async (id: number | string) => {
    try {
      const updatedDoc = await deleteAudioOnlyApi(id)
      revokeTempBlob(id)
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? updatedDoc : doc)),
      )
      showToast(t("toast_audio_deleted"), "success")
      void refreshFromServer()
    } catch (err) {
      showToast(
        t("toast_audio_delete_failed", { error: (err as Error).message }),
        "error",
      )
    }
  }

  const handleRetranscribe = async (
    id: number | string,
    options: RetranscribeOptions,
  ) => {
    const previousDoc = documents.find((d) => d.id === id)
    if (!previousDoc) return

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "Processing" } : d)),
    )

    try {
      const updatedDoc = await retranscribeDocumentApi(id, options, userApiKey)
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? updatedDoc : doc)),
      )
      showToast(t("toast_retranscribe_success"), "success")
      void refreshFromServer()
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? previousDoc : d)),
      )
      showToast(
        t("toast_retranscribe_failed", { error: (err as Error).message }),
        "error",
      )
    }
  }

  const handleRenameDocument = async (id: number | string, newName: string) => {
    try {
      const updatedDoc = await renameDocumentApi(id, newName)
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? updatedDoc : doc)),
      )
      showToast(t("toast_renamed_to", { name: newName }), "success")
    } catch (err) {
      showToast(t("toast_rename_failed", { error: (err as Error).message }), "error")
    }
  }

  const handleDuplicateDocument = async (doc: DocumentItem) => {
    try {
      const copiedDoc = await duplicateDocumentApi(doc.id)
      setDocuments((prev) => [copiedDoc, ...prev])
      showToast(t("toast_duplicated", { name: doc.name }), "success")
    } catch (err) {
      showToast(t("toast_duplicate_failed", { error: (err as Error).message }), "error")
    }
  }

  const handleUpdateSummary = async (id: number | string, summary: DocumentItem["summary"]) => {
    if (!summary) return
    try {
      const updatedDoc = await updateDocumentSummaryApi(id, summary)
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? updatedDoc : doc)),
      )
    } catch (err) {
      showToast(t("toast_summary_save_failed", { error: (err as Error).message }), "error")
    }
  }

  const handleCancelUpload = (id: string | number) => {
    cancelledUploadsRef.current.add(id)
    const controller = uploadControllersRef.current.get(id)
    if (controller) {
      controller.abort()
      uploadControllersRef.current.delete(id)
    }
    revokeTempBlob(id)
    setDocuments((prev) => prev.filter((d) => d.id !== id))
    showToast(t("toast_upload_cancelled"), "info")
  }

  return (
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden bg-background font-sans text-fg print:block print:overflow-visible print:h-auto print:bg-white print:text-slate-950">
      {/* Top Header (mobile) */}
      <div className="md:hidden">
        <TopHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
      </div>

      {/* Mobile Drawer */}
      <MobileNav
        open={mobileNavOpen}
        setOpen={setMobileNavOpen}
        uploadCount={quota.uploadCount}
        maxUploads={quota.maxUploads}
        storageUsed={quota.storageUsed}
        storageLimit={quota.storageLimit}
        hasCustomKey={hasCustomKey}
        apiKeyStatus={apiKeyStatus}
      />

      {/* Desktop Sidebar */}
      <Sidebar
        uploadCount={quota.uploadCount}
        maxUploads={quota.maxUploads}
        storageUsed={quota.storageUsed}
        storageLimit={quota.storageLimit}
        hasCustomKey={hasCustomKey}
        apiKeyStatus={apiKeyStatus}
      />

      {/* Main Content Area with React Router */}
      <div className="flex-1 flex flex-col overflow-hidden print:block print:overflow-visible print:h-auto print:bg-white">
        {loadError && (
          <div className="px-4 sm:px-6 py-3 no-print">
            <Alert
              variant="danger"
              title={t("error_load_title")}
              action={
                <button
                  onClick={() => void loadInitialData()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-danger-contrast bg-danger hover:bg-danger/90 transition-colors"
                >
                  <ArrowClockwise size={13} weight="bold" />
                  {t("btn_retry")}
                </button>
              }
            >
              {t("error_load_desc")}
            </Alert>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                documents={documents}
                isLoading={initialLoading}
                onUploadFile={handleUploadFile}
                onOpenLiveRecorder={handleOpenLiveRecorder}
                onDeleteDocument={handleDeleteDocument}
                onDeleteAudioOnly={handleDeleteAudioOnly}
                onRenameDocument={handleRenameDocument}
                onDuplicateDocument={handleDuplicateDocument}
                setModal={setRateModalOpen}
                uploadCount={quota.uploadCount}
                maxUploads={quota.maxUploads}
                hasCustomKey={hasCustomKey}
              />
            }
          />
          <Route
            path="/workspace"
            element={
              <Workspace
                documents={documents}
                isLoading={initialLoading}
                onReSummarize={handleReSummarize}
                onDeleteDocument={handleDeleteDocument}
                onDeleteAudioOnly={handleDeleteAudioOnly}
                onRetranscribe={handleRetranscribe}
                onRenameDocument={handleRenameDocument}
                onDuplicateDocument={handleDuplicateDocument}
                onUpdateSummary={handleUpdateSummary}
                onCancelUpload={handleCancelUpload}
              />
            }
          />
          <Route
            path="/workspace/:id"
            element={
              <Workspace
                documents={documents}
                isLoading={initialLoading}
                onReSummarize={handleReSummarize}
                onDeleteDocument={handleDeleteDocument}
                onDeleteAudioOnly={handleDeleteAudioOnly}
                onRetranscribe={handleRetranscribe}
                onRenameDocument={handleRenameDocument}
                onDuplicateDocument={handleDuplicateDocument}
                onUpdateSummary={handleUpdateSummary}
                onCancelUpload={handleCancelUpload}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsPage
                currentApiKey={userApiKey}
                onSaveApiKey={saveApiKey}
              />
            }
          />
          {/* Unknown URLs previously rendered a blank screen. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Live Audio Recorder Modal & Minimized Floating Transport Bar */}
      {(liveRecorderOpen || liveRecorderMinimized) && (
        <LiveRecorderModal
          isMinimized={liveRecorderMinimized}
          onMinimize={() => {
            setLiveRecorderMinimized(true)
            setLiveRecorderOpen(false)
          }}
          onExpand={() => {
            setLiveRecorderMinimized(false)
            setLiveRecorderOpen(true)
          }}
          onClose={() => {
            setLiveRecorderOpen(false)
            setLiveRecorderMinimized(false)
          }}
          onUploadFile={handleUploadFile}
        />
      )}

      {/* Rate Limit Modal */}
      {rateModalOpen && (
        <RateLimitModal
          onClose={() => setRateModalOpen(false)}
          onSaveApiKey={(key) => {
            saveApiKey(key)
            setRateModalOpen(false)
          }}
          resetTime={quota.resetTime}
        />
      )}

      {/* Auth & Device Sync Modal */}
      <AuthModal
        open={authModalOpen}
        initialTab={authModalTab}
        onClose={closeAuthModal}
      />
    </div>
  )
}

