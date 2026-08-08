import { useState, useEffect } from "react"
import { Screen, DocumentItem } from "./types"
import Sidebar from "./components/layout/Sidebar"
import MobileNav from "./components/layout/MobileNav"
import Dashboard from "./components/dashboard/Dashboard"
import Workspace from "./components/workspace/Workspace"
import RateLimitModal from "./components/modals/RateLimitModal"
import SettingsModal from "./components/modals/SettingsModal"
import {
  uploadAudioToApi,
  reSummarizeApi,
  fetchDocumentsFromApi,
  deleteDocumentApi,
  renameDocumentApi,
  duplicateDocumentApi,
  updateDocumentSummaryApi,
  fetchRateLimitApi,
  pollDocumentStatusApi,
} from "./services/api"
import { useToast } from "./components/ui/ToastContext"

export default function App() {
  const { showToast } = useToast()
  const [screen, setScreen] = useState<Screen>("dashboard")
  const [rateModalOpen, setRateModalOpen] = useState<boolean>(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false)

  // Start with empty documents list (no fake/dummy documents)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [activeDocument, setActiveDocument] = useState<DocumentItem | null>(
    null,
  )
  const [uploadCount, setUploadCount] = useState<number>(0)
  const [storageUsed, setStorageUsed] = useState<number>(0)
  const [storageLimit, setStorageLimit] = useState<number>(500 * 1024 * 1024)

  // API Key & Model state with localStorage persistence
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem("audin_user_api_key") || ""
  })
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return (
      localStorage.getItem("audin_selected_model") || "llama-3.3-70b-versatile"
    )
  })

  useEffect(() => {
    localStorage.setItem("audin_user_api_key", userApiKey)
  }, [userApiKey])

  // API key validation
  const [apiKeyStatus, setApiKeyStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle")

  useEffect(() => {
    const key = userApiKey?.trim()
    if (!key) {
      setApiKeyStatus("idle")
      return
    }

    setApiKeyStatus("validating")
    const controller = new AbortController()
    
    fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
      .then((res) => {
        setApiKeyStatus(res.ok ? "valid" : "invalid")
      })
      .catch((err) => {
        if (err.name !== "AbortError") setApiKeyStatus("invalid")
      })

    return () => controller.abort()
  }, [userApiKey])

  useEffect(() => {
    localStorage.setItem("audin_selected_model", selectedModel)
  }, [selectedModel])

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
  useEffect(() => {
    fetchDocumentsFromApi().then((docs) => {
      if (docs) {
        setDocuments(docs.reverse())
      }
    })
    fetchRateLimitApi().then((status) => {
      if (status && status.maxLimit && typeof status.remaining === "number") {
        const used = status.maxLimit - status.remaining
        setUploadCount(used)
        if (status.storageUsed !== undefined) {
          setStorageUsed(status.storageUsed)
          setStorageLimit(status.storageLimit || 500 * 1024 * 1024)
        }
      }
    })
  }, [])

  const handleOpenDocument = (doc: DocumentItem) => {
    setActiveDocument(doc)
    setScreen("workspace")
  }

  const handleUploadFile = async (file: File) => {
    // Check if free portfolio limit is reached and user has no custom key
    if (uploadCount >= 5 && !userApiKey?.trim()) {
      setRateModalOpen(true)
      return
    }

    const blobUrl = URL.createObjectURL(file)
    const newId = Date.now()
    const nowStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const baseName = file.name.replace(/\.[^/.]+$/, "")

    // 1. Calculate audio duration using HTML5 Audio
    let durationSec = 30
    let durationStr = "0m 30s"

    try {
      const audio = new Audio(blobUrl)
      await new Promise<void>((resolve) => {
        audio.onloadedmetadata = () => {
          if (
            audio.duration &&
            !isNaN(audio.duration) &&
            audio.duration !== Infinity
          ) {
            durationSec = Math.floor(audio.duration)
            const m = Math.floor(durationSec / 60)
            const s = durationSec % 60
            durationStr = `${m}m ${s.toString().padStart(2, "0")}s`
            resolve()
          } else if (audio.duration === Infinity) {
            // Fix for Infinity duration bug in Chromium with blobs
            audio.currentTime = Number.MAX_SAFE_INTEGER
            audio.ontimeupdate = () => {
              audio.ontimeupdate = null
              audio.currentTime = 0
              if (
                audio.duration &&
                !isNaN(audio.duration) &&
                audio.duration !== Infinity
              ) {
                durationSec = Math.floor(audio.duration)
                const m = Math.floor(durationSec / 60)
                const s = durationSec % 60
                durationStr = `${m}m ${s.toString().padStart(2, "0")}s`
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

    setDocuments((prev) => [newDoc, ...prev])
    setUploadCount((prev) => prev + 1)
    setActiveDocument(newDoc)
    setScreen("workspace")

    // 2. Try uploading to backend API or process AI
    try {
      const apiResult = await uploadAudioToApi(
        file,
        userApiKey,
        durationStr,
        durationSec,
        (progress) => {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === newId ? { ...d, uploadProgress: progress } : d,
            ),
          )
          if (activeDocument?.id === newId) {
            setActiveDocument((prev) =>
              prev ? { ...prev, uploadProgress: progress } : null,
            )
          }
        },
      )

      if (apiResult && apiResult.id) {
        // Backend API returned 202 Accepted (Background Processing) or 201 Completed
        const processingDoc: DocumentItem = {
          ...apiResult, 
          audioUrl: apiResult.audioUrl || blobUrl,
          uploadProgress: 100, // Finish upload bar
        }

        setDocuments((prev) =>
          prev.map((d) => (d.id === newId ? processingDoc : d)),
        )
        setActiveDocument(processingDoc)
        
        if (processingDoc.status === "Processing") {
           showToast("Upload Complete! AI is now processing your audio in the background. You can safely leave this page.", "info")
           
           // Start polling
           const pollInterval = setInterval(async () => {
             const updated = await pollDocumentStatusApi(processingDoc.id)
             if (updated && updated.status !== "Processing") {
                clearInterval(pollInterval)
                setDocuments((prev) =>
                  prev.map((d) => (d.id === processingDoc.id ? updated : d)),
                )
                setActiveDocument((prev) => 
                  prev?.id === processingDoc.id ? updated : prev
                )
                
                if (updated.status === "Completed") {
                  showToast(`Processing finished for ${updated.name}!`, "success")
                } else {
                  showToast(`Processing failed for ${updated.name}.`, "error")
                }
                // Refresh storage info after processing completes
                fetchRateLimitApi().then((status) => {
                  if (status) {
                    if (status.storageUsed !== undefined) setStorageUsed(status.storageUsed)
                    if (status.storageLimit !== undefined) setStorageLimit(status.storageLimit)
                  }
                })
             }
           }, 3000)
        }
        return
      } else {
        throw new Error("Invalid response from backend")
      }
    } catch (err: any) {
      console.error("Upload failed:", err)
      const errorDoc: DocumentItem = {
        ...newDoc,
        status: "Failed",
      }
      setDocuments((prev) => prev.map((d) => (d.id === newId ? errorDoc : d)))
      setActiveDocument(errorDoc)

      // If error is related to API key, prompt user
      if (
        err.message?.toLowerCase().includes("api key") ||
        (err.message?.toLowerCase().includes("rate limit") && !userApiKey?.trim())
      ) {
        setRateModalOpen(true)
      } else {
        showToast(
          `Processing failed: ${err.message || "Unknown error"}`,
          "error",
        )
      }
    }
  }

  const handleReSummarize = async (
    id: string | number,
    customPrompt?: string,
  ) => {
    if (!userApiKey?.trim() && uploadCount >= 5) {
      setRateModalOpen(true)
      return
    }

    // Optimistic UI update to show processing
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "Processing" } : d)),
    )
    if (activeDocument?.id === id)
      setActiveDocument((prev) =>
        prev ? { ...prev, status: "Processing" } : null,
      )

    setUploadCount((prev) => prev + 1)

    try {
      const updatedDoc = await reSummarizeApi(id, userApiKey, customPrompt)
      setDocuments((prev) => prev.map((d) => (d.id === id ? updatedDoc : d)))
      if (activeDocument?.id === id) setActiveDocument(updatedDoc)
    } catch (err: any) {
      // Revert status on failure
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "Completed" } : d)),
      )
      if (activeDocument?.id === id)
        setActiveDocument((prev) =>
          prev ? { ...prev, status: "Completed" } : null,
        )

      if (
        err.message?.toLowerCase().includes("api key") ||
        err.message?.toLowerCase().includes("rate limit")
      ) {
        setRateModalOpen(true)
      } else {
        showToast(
          `Re-summarize failed: ${err.message || "Unknown error"}`,
          "error",
        )
      }
    }
  }

  const handleDeleteDocument = async (id: number | string) => {
    try {
      const success = await deleteDocumentApi(id)
      if (success) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id))
        if (activeDocument?.id === id) {
          setActiveDocument(null)
        }
        // Refresh storage info after deletion
        fetchRateLimitApi().then((status) => {
          if (status) {
            if (status.storageUsed !== undefined) setStorageUsed(status.storageUsed)
            if (status.storageLimit !== undefined) setStorageLimit(status.storageLimit)
          }
        })
      }
    } catch (err: any) {
      showToast(`Failed to delete document: ${err.message}`, "error")
    }
  }

  const handleRenameDocument = async (id: number | string, newName: string) => {
    try {
      const updatedDoc = await renameDocumentApi(id, newName)
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? updatedDoc : doc)),
      )
      if (activeDocument?.id === id) {
        setActiveDocument(updatedDoc)
      }
    } catch (err: any) {
      showToast(`Failed to rename document: ${err.message}`, "error")
    }
  }

  const handleDuplicateDocument = async (doc: DocumentItem) => {
    try {
      const copiedDoc = await duplicateDocumentApi(doc.id)
      setDocuments((prev) => [copiedDoc, ...prev])
    } catch (err: any) {
      showToast(`Failed to duplicate document: ${err.message}`, "error")
    }
  }

  const handleUpdateSummary = async (id: number | string, summary: any) => {
    try {
      const updatedDoc = await updateDocumentSummaryApi(id, summary)
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? updatedDoc : doc)),
      )
      if (activeDocument?.id === id) {
        setActiveDocument(updatedDoc)
      }
    } catch (err: any) {
      showToast(`Failed to save summary: ${err.message}`, "error")
    }
  }

  const handleNavScreenChange = (newScreen: Screen) => {
    setScreen(newScreen)
  }

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background font-sans text-fg print:block print:overflow-visible print:h-auto">
      {/* Mobile Top Navigation & Drawer */}
      <MobileNav
        screen={screen}
        setScreen={handleNavScreenChange}
        setModal={setRateModalOpen}
        onOpenSettings={() => setSettingsModalOpen(true)}
        uploadCount={uploadCount}
        storageUsed={storageUsed}
        storageLimit={storageLimit}
        hasCustomKey={!!userApiKey?.trim()}
        apiKeyStatus={apiKeyStatus}
      />

      {/* Desktop Sidebar */}
      <Sidebar
        screen={screen}
        setScreen={handleNavScreenChange}
        setModal={setRateModalOpen}
        onOpenSettings={() => setSettingsModalOpen(true)}
        uploadCount={uploadCount}
        storageUsed={storageUsed}
        storageLimit={storageLimit}
        hasCustomKey={!!userApiKey?.trim()}
        apiKeyStatus={apiKeyStatus}
        documents={documents}
        activeDocument={activeDocument}
        onSelectDocument={(doc) => {
          setActiveDocument(doc)
          setScreen("workspace")
        }}
        onDeleteDocument={handleDeleteDocument}
        onRenameDocument={handleRenameDocument}
        onDuplicateDocument={handleDuplicateDocument}
      />

      {/* Main Screen Router */}
      <div className="flex-1 flex flex-col overflow-hidden print:block print:overflow-visible print:h-auto">
        {screen === "dashboard" ? (
          <Dashboard
            documents={documents}
            onOpenDocument={handleOpenDocument}
            onUploadFile={handleUploadFile}
            onDeleteDocument={handleDeleteDocument}
            onRenameDocument={handleRenameDocument}
            onDuplicateDocument={handleDuplicateDocument}
            setModal={setRateModalOpen}
            uploadCount={uploadCount}
            hasCustomKey={!!userApiKey?.trim()}
          />
        ) : (
          <Workspace
            documents={documents}
            document={activeDocument}
            onSelectDocument={(doc) => setActiveDocument(doc)}
            onClearSelectedDocument={() => setActiveDocument(null)}
            setScreen={setScreen}
            setModal={setRateModalOpen}
            onReSummarize={handleReSummarize}
            onDeleteDocument={handleDeleteDocument}
            onRenameDocument={handleRenameDocument}
            onDuplicateDocument={handleDuplicateDocument}
            onUpdateSummary={handleUpdateSummary}
          />
        )}
      </div>

      {/* Rate Limit Modal */}
      {rateModalOpen && (
        <RateLimitModal
          onClose={() => setRateModalOpen(false)}
          onSaveApiKey={(key) => {
            setUserApiKey(key)
            setRateModalOpen(false)
          }}
        />
      )}

      {/* Settings Modal */}
      {settingsModalOpen && (
        <SettingsModal
          onClose={() => setSettingsModalOpen(false)}
          userApiKey={userApiKey}
          onSaveApiKey={setUserApiKey}
          selectedModel={selectedModel}
          onSaveModel={setSelectedModel}
          uploadCount={uploadCount}
        />
      )}
    </div>
  )
}
