import { useState } from "react"
import { Screen, DocumentItem } from "../../types"
import AudioPlayer from "./AudioPlayer"
import TranscriptPanel from "./TranscriptPanel"
import SummaryEditor from "./SummaryEditor"
import StatusBadge from "../dashboard/StatusBadge"
import { useToast } from "../ui/ToastContext"
import { API_BASE_URL } from "../../services/api"

interface WorkspaceProps {
  documents: DocumentItem[]
  document: DocumentItem | null
  onSelectDocument: (doc: DocumentItem) => void
  onClearSelectedDocument: () => void
  setScreen: (s: Screen) => void
  setModal: (v: boolean) => void
  onReSummarize: (id: string | number, customPrompt?: string) => void
  onDeleteDocument: (id: number | string) => void
  onRenameDocument: (id: number | string, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
  onUpdateSummary: (id: number | string, summary: any) => void
  onCancelUpload?: (id: number | string) => void
  onBackNavigation?: () => void
}

export default function Workspace({
  documents,
  document,
  onSelectDocument,
  onClearSelectedDocument,
  setScreen,
  setModal,
  onReSummarize,
  onDeleteDocument,
  onRenameDocument,
  onDuplicateDocument,
  onUpdateSummary,
  onCancelUpload,
  onBackNavigation,
}: WorkspaceProps) {
  const { showToast } = useToast()
  const [openMenuId, setOpenMenuId] = useState<number | string | null>(null)
  const [deleteModalDoc, setDeleteModalDoc] = useState<DocumentItem | null>(
    null,
  )
  const [renameModalDoc, setRenameModalDoc] = useState<DocumentItem | null>(
    null,
  )
  const [renameValue, setRenameValue] = useState("")
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] =
    useState<"all" | "Completed" | "Processing">("all")
  const [showReSummarizeModal, setShowReSummarizeModal] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">(
    "transcript",
  )

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleActionClick = (
    e: React.MouseEvent,
    action: string,
    doc: DocumentItem,
  ) => {
    e.stopPropagation()
    setOpenMenuId(null)

    if (action === "Rename") {
      setRenameValue(doc.name)
      setRenameModalDoc(doc)
    } else if (action === "Delete") {
      setDeleteModalDoc(doc)
    } else if (action === "Duplicate") {
      onDuplicateDocument(doc)
      showToast(`Duplicated "${doc.name}"`, "success")
    } else if (action === "Download") {
      handleDownloadAudio(doc)
    }
  }

  // VIEW 1: Audio Files Library List when no specific document is open
  if (!document) {
    return (
      <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 animate-fade-in">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold font-display text-fg tracking-tight mb-1">
                Workspace Audio Files ({documents.length})
              </h1>
              <p className="text-sm text-fg-secondary">
                Select an audio file from your library to open its player,
                transcript, and AI summary.
              </p>
            </div>
            <button
              onClick={() => setScreen("dashboard")}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface border border-border text-fg-secondary hover:text-fg hover:bg-surface-2 transition-all self-start sm:self-auto"
            >
              ← Back to Dashboard
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search audio files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-sans bg-surface border border-border text-fg outline-none focus:border-indigo-500 transition-all"
              />
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-4 h-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 19l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-border">
              {(["all", "Completed", "Processing"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    statusFilter === filter
                      ? "bg-primary-dim text-primary-hover border border-indigo-500/20 font-semibold"
                      : "text-fg-tertiary hover:text-fg"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* File Grid */}
          {filteredDocs.length === 0 ? (
            <div className="rounded-2xl p-12 text-center border border-border bg-surface">
              <p className="text-sm text-fg-tertiary">
                No audio files found. Upload a file on the Dashboard to get
                started!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc)}
                  className="rounded-2xl p-5 bg-surface border border-border hover:border-indigo-500/40 hover:bg-surface-2 transition-all duration-200 cursor-pointer flex flex-col justify-between group shadow-sm hover:shadow-lg"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3 relative">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary-dim border border-indigo-500/20 group-hover:scale-105 transition-transform">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-5 h-5 text-primary"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zM9 10l12-3"
                          />
                        </svg>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={doc.status} uploadProgress={doc.uploadProgress} />
                        <div className="relative">
                          <button
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface border border-transparent hover:border-border transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(
                                openMenuId === doc.id ? null : doc.id,
                              )
                            }}
                            aria-label="More options"
                            title="More options"
                          >
                            <svg
                              viewBox="0 0 16 16"
                              fill="currentColor"
                              className="w-3.5 h-3.5"
                            >
                              <circle cx="8" cy="3" r="1.25" />
                              <circle cx="8" cy="8" r="1.25" />
                              <circle cx="8" cy="13" r="1.25" />
                            </svg>
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuId === doc.id && (
                            <div
                              className="absolute right-0 mt-1 w-40 bg-surface border border-border shadow-xl rounded-xl py-1 z-50 animate-scale-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {[
                                {
                                  label: "Rename",
                                  iconPath:
                                    "M11.5 2.5a2.121 2.121 0 013 3L5 15H2v-3L11.5 2.5z",
                                },
                                {
                                  label: "Download",
                                  iconPath:
                                    "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
                                },
                                {
                                  label: "Duplicate",
                                  iconPath:
                                    "M8 2H4a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V8m-6 0V2m0 0l4 4",
                                },
                              ].map((item) => (
                                <button
                                  key={item.label}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
                                  onClick={(e) =>
                                    handleActionClick(e, item.label, doc)
                                  }
                                >
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    className="w-3.5 h-3.5 flex-shrink-0"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d={item.iconPath}
                                    />
                                  </svg>
                                  {item.label}
                                </button>
                              ))}
                              <div className="my-1 mx-2 h-px bg-border" />
                              <button
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                                onClick={(e) =>
                                  handleActionClick(e, "Delete", doc)
                                }
                              >
                                <svg
                                  viewBox="0 0 20 20"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  className="w-3.5 h-3.5 flex-shrink-0"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-fg group-hover:text-primary-hover transition-colors line-clamp-2 mb-2 leading-snug">
                      {doc.name}
                    </h3>
                  </div>

                  <div className="pt-4 border-t border-border-subtle mt-3 flex items-center justify-between text-xs font-mono text-fg-tertiary">
                    <span>{doc.duration}</span>
                    <span>{doc.date}</span>
                  </div>

                  <button className="w-full mt-4 py-2 rounded-xl text-xs font-medium bg-surface-2 group-hover:bg-primary-dim text-fg-secondary group-hover:text-primary-hover border border-border group-hover:border-indigo-500/30 transition-all flex items-center justify-center gap-1.5">
                    Open Workspace →
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Modals for Rename and Delete */}
          {renameModalDoc && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
              onClick={() => setRenameModalDoc(null)}
            >
              <div
                className="w-full max-w-sm bg-surface border border-border shadow-2xl rounded-2xl p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-fg mb-1">
                  Rename Document
                </h3>
                <p className="text-sm text-fg-secondary mb-4">
                  Enter a new name for this file.
                </p>
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-xl text-sm text-fg focus:outline-none focus:border-primary mb-5"
                />
                <div className="flex justify-end gap-2">
                  <button
                    className="px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 rounded-xl border border-transparent hover:border-border transition-colors"
                    onClick={() => setRenameModalDoc(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-hover rounded-xl shadow-sm transition-colors"
                    onClick={() => {
                      if (renameValue.trim()) {
                        onRenameDocument(renameModalDoc.id, renameValue.trim())
                        showToast("Document renamed successfully", "success")
                      }
                      setRenameModalDoc(null)
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {deleteModalDoc && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
              onClick={() => setDeleteModalDoc(null)}
            >
              <div
                className="w-full max-w-sm bg-surface border border-border shadow-2xl rounded-2xl p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="w-5 h-5 text-red-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-fg mb-1">
                  Delete Document
                </h3>
                <p className="text-sm text-fg-secondary mb-5">
                  Are you sure you want to delete{" "}
                  <span className="text-fg font-medium">
                    "{deleteModalDoc.name}"
                  </span>
                  ? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    className="px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 rounded-xl border border-transparent hover:border-border transition-colors"
                    onClick={() => setDeleteModalDoc(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors"
                    onClick={() => {
                      onDeleteDocument(deleteModalDoc.id)
                      showToast("Document deleted successfully", "success")
                      setDeleteModalDoc(null)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  const handleDownloadAudio = async (doc: DocumentItem) => {
    if (!doc.audioUrl) {
      showToast("Audio file not found", "error")
      return
    }

    // Determine correct filename with proper format extension
    let filename = doc.name.trim()
    const extRegex = /\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i
    if (!extRegex.test(filename)) {
      const urlExtMatch = doc.audioUrl.match(extRegex)
      const ext = urlExtMatch ? urlExtMatch[0] : ".mp3"
      filename = `${filename}${ext}`
    }

    showToast(`Downloading "${filename}"...`, "info")

    try {
      // Always use backend proxy to avoid CORS issues with cloud storage
      const proxyUrl = `${API_BASE_URL}/documents/${doc.id}/download`
      const res = await fetch(proxyUrl, {
        headers: { "X-User-Session": localStorage.getItem("audin_session_id") || "" },
      })
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = filename
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      setTimeout(() => window.URL.revokeObjectURL(url), 1000)
      showToast(`Downloaded "${filename}" successfully`, "success")
    } catch (err) {
      console.error("Download failed:", err)
      showToast("Download failed. Please try again.", "error")
    }
  }

  // VIEW 2: Dual Panel Workspace for selected document
  const docName = document.name
  const docDate = document.date
  const transcripts = document.transcripts || []
  const isProcessing = document.status === "Processing"
  const hasError = document.status === "Failed"

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background print:block print:overflow-visible print:h-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border bg-surface flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBackNavigation || onClearSelectedDocument}
            className="p-1.5 rounded-lg text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0 flex items-center gap-1 text-xs font-medium"
            aria-label="Back"
            title="Back"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 13L5 8l5-5"
              />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="w-px h-4 flex-shrink-0 bg-border" />
          <div className="min-w-0">
            <p className="text-sm font-semibold font-display truncate text-fg">
              {docName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <p className="text-xs font-mono text-fg-tertiary">
                Saved · {docDate}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Split Panels / Tabs for Mobile */}
      <div className="flex-1 flex flex-col overflow-hidden relative print:block print:overflow-visible print:h-auto">
        {/* Mobile Tabs Header */}
        <div className="md:hidden flex items-center border-b border-border bg-surface print:hidden">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "transcript"
                ? "border-primary text-primary-hover"
                : "border-transparent text-fg-secondary hover:text-fg"
            }`}
            onClick={() => setActiveTab("transcript")}
          >
            Audio & Transcript
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "summary"
                ? "border-primary text-primary-hover"
                : "border-transparent text-fg-secondary hover:text-fg"
            }`}
            onClick={() => setActiveTab("summary")}
          >
            AI Summary
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:block print:overflow-visible print:h-auto">
          {/* Left Panel: Audio Player & Raw Transcript */}
          <div
            className={`w-full md:w-2/5 flex-col border-b md:border-b-0 md:border-r border-border bg-surface md:max-h-none overflow-hidden print:hidden ${
              activeTab === "transcript" ? "flex" : "hidden md:flex"
            }`}
          >
            <AudioPlayer
              audioUrl={document.audioUrl}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              durationSeconds={document.durationSec}
              onDownload={() => handleDownloadAudio(document)}
            />
            <TranscriptPanel
              entries={transcripts}
              currentTime={currentTime}
              onSeekTo={(secs) => setCurrentTime(secs)}
            />
          </div>

          {/* Right Panel: Executive AI Summary */}
          <div
            className={`w-full md:w-3/5 flex-col overflow-hidden bg-background print:block print:w-full print:overflow-visible print:h-auto ${
              activeTab === "summary" ? "flex" : "hidden md:flex"
            }`}
          >
            <SummaryEditor
              document={document}
              onUpdateSummary={onUpdateSummary}
              onReSummarize={onReSummarize}
              onCancelUpload={onCancelUpload}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
