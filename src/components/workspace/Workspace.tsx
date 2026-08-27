import { useState, useMemo, useEffect, MouseEvent } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { DocumentItem } from "../../types"
import AudioPlayer from "./AudioPlayer"
import TranscriptPanel from "./TranscriptPanel"
import SummaryEditor from "./SummaryEditor"
import StatusBadge from "../dashboard/StatusBadge"
import DocCard, { DocCardSkeleton } from "../dashboard/DocCard"
import EmptyState, { EmptyStateSkeleton } from "../ui/EmptyState"
import Modal from "../ui/Modal"
import { useToast } from "../ui/ToastContext"
import { useLanguage } from "../../context/LanguageContext"
import { downloadAudioFile } from "../../services/download"
import {
  ArrowLeft,
  MagnifyingGlass,
  PlayCircle,
  DotsThreeVertical,
  PencilSimple,
  DownloadSimple,
  Copy,
  Trash,
} from "@phosphor-icons/react"

interface WorkspaceProps {
  documents: DocumentItem[]
  isLoading?: boolean
  onReSummarize: (id: string | number, customPrompt?: string) => void
  onDeleteDocument: (id: number | string) => void
  onRenameDocument: (id: number | string, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
  onUpdateSummary: (id: number | string, summary: DocumentItem["summary"]) => void
  onCancelUpload?: (id: number | string) => void
}

export default function Workspace({
  documents,
  isLoading = false,
  onReSummarize,
  onDeleteDocument,
  onRenameDocument,
  onDuplicateDocument,
  onUpdateSummary,
  onCancelUpload,
}: WorkspaceProps) {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { showToast } = useToast()

  const [currentTime, setCurrentTime] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "Completed" | "Processing">("all")
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">("transcript")

  // Workspace file card kebab menu & modal states
  const [openMenuId, setOpenMenuId] = useState<number | string | null>(null)
  const [deleteModalDoc, setDeleteModalDoc] = useState<DocumentItem | null>(null)
  const [renameModalDoc, setRenameModalDoc] = useState<DocumentItem | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Close any open dropdown when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (openMenuId === null) return
    const close = () => setOpenMenuId(null)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenuId(null)
    window.addEventListener("click", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [openMenuId])

  // Active document selected by route param
  const document = useMemo(() => {
    if (!id) return null
    return documents.find((d) => String(d.id) === String(id)) || null
  }, [id, documents])

  // Playback belongs to the document — reset when switching files.
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setActiveTab("transcript")
  }, [document?.id])

  const filteredDocs = useMemo(
    () =>
      documents.filter((doc) => {
        const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesStatus = statusFilter === "all" || doc.status === statusFilter
        return matchesSearch && matchesStatus
      }),
    [documents, searchQuery, statusFilter],
  )

  const handleDownloadAudio = async (doc: DocumentItem) => {
    showToast(t("toast_downloading", { name: doc.name }), "info")
    try {
      await downloadAudioFile(doc)
      showToast(t("toast_download_done", { name: doc.name }), "success")
    } catch (err) {
      console.error("Download failed:", err)
      if ((err as Error).message === "Audio file not found") {
        showToast(t("toast_audio_not_found"), "error")
      } else {
        showToast(t("toast_download_failed"), "error")
      }
    }
  }

  const handleActionClick = async (
    e: MouseEvent,
    action: string,
    doc: DocumentItem,
  ) => {
    e.stopPropagation()
    setOpenMenuId(null)

    if (action === "rename") {
      setRenameValue(doc.name)
      setRenameModalDoc(doc)
    } else if (action === "duplicate") {
      onDuplicateDocument(doc)
    } else if (action === "download") {
      await handleDownloadAudio(doc)
    } else if (action === "delete") {
      setDeleteModalDoc(doc)
    }
  }

  const confirmDelete = () => {
    if (deleteModalDoc) {
      onDeleteDocument(deleteModalDoc.id)
      setDeleteModalDoc(null)
    }
  }

  const confirmRename = () => {
    if (renameModalDoc && renameValue.trim()) {
      onRenameDocument(renameModalDoc.id, renameValue.trim())
      setRenameModalDoc(null)
    }
  }

  const menuActions = [
    { id: "rename", text: t("action_rename"), icon: <PencilSimple size={15} weight="duotone" /> },
    { id: "download", text: t("action_download"), icon: <DownloadSimple size={15} weight="duotone" /> },
    { id: "duplicate", text: t("action_duplicate"), icon: <Copy size={15} weight="duotone" /> },
  ] as const

  /** Kebab dropdown rendered into DocCard's action slot. */
  const renderKebab = (doc: DocumentItem) => (
    <div className="relative">
      <button
        className="w-9 h-9 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setOpenMenuId(openMenuId === doc.id ? null : doc.id)
        }}
        aria-label={t("a11y_more_options")}
        title={t("a11y_more_options")}
        aria-expanded={openMenuId === doc.id}
        aria-haspopup="menu"
      >
        <DotsThreeVertical size={17} weight="bold" />
      </button>

      {openMenuId === doc.id && (
        <div
          className="absolute right-0 mt-1.5 w-44 rounded-xl bg-surface border border-border shadow-raised py-1.5 z-50 animate-scale-in"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {menuActions.map((act) => (
            <button
              key={act.id}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
              onClick={(e) => handleActionClick(e, act.id, doc)}
            >
              {act.icon}
              <span>{act.text}</span>
            </button>
          ))}
          <div className="my-1 mx-2 h-px bg-border" />
          <button
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-danger hover:bg-danger-dim transition-colors cursor-pointer"
            onClick={(e) => handleActionClick(e, "delete", doc)}
          >
            <Trash size={15} weight="duotone" />
            <span>{t("action_delete")}</span>
          </button>
        </div>
      )}
    </div>
  )

  // VIEW 1: Audio Library Hub (when no file is currently opened in studio)
  if (!document) {
    return (
      <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 animate-fade-in">
        {/* Delete confirmation modal */}
        {deleteModalDoc && (
          <Modal
            onClose={() => setDeleteModalDoc(null)}
            labelledBy="delete-modal-title"
            panelClassName="bg-surface border border-danger/25 w-full max-w-sm rounded-xl p-6 shadow-raised animate-scale-in"
          >
            <div className="w-12 h-12 rounded-full bg-danger-dim flex items-center justify-center mb-4 text-danger">
              <Trash size={24} weight="duotone" />
            </div>
            <h3 id="delete-modal-title" className="text-base sm:text-lg font-bold font-display text-fg mb-1">
              {t("modal_delete_title")}
            </h3>
            <p className="text-xs text-fg-secondary mb-6 leading-relaxed">
              {t("modal_delete_desc")}{" "}
              <span className="font-semibold text-fg">"{deleteModalDoc.name}"</span>? {t("modal_delete_subdesc")}
            </p>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setDeleteModalDoc(null)}
                autoFocus
                className="px-4 py-2.5 text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-xl transition-colors min-h-[36px] cursor-pointer"
              >
                {t("btn_cancel")}
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2.5 text-xs font-semibold text-danger-contrast bg-danger hover:bg-danger/90 rounded-xl transition-colors min-h-[36px] cursor-pointer"
              >
                {t("btn_delete")}
              </button>
            </div>
          </Modal>
        )}

        {/* Rename modal */}
        {renameModalDoc && (
          <Modal
            onClose={() => setRenameModalDoc(null)}
            labelledBy="rename-modal-title"
            panelClassName="bg-surface border border-border w-full max-w-sm rounded-2xl p-6 shadow-raised animate-scale-in"
          >
            <div className="w-12 h-12 rounded-lg bg-primary-dim flex items-center justify-center mb-4 text-primary">
              <PencilSimple size={24} weight="duotone" />
            </div>
            <h3 id="rename-modal-title" className="text-base sm:text-lg font-bold font-display text-fg mb-1">
              {t("modal_rename_title")}
            </h3>
            <p className="text-xs text-fg-secondary mb-4">
              {t("modal_rename_desc")}
            </p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename()
                if (e.key === "Escape") setRenameModalDoc(null)
              }}
              autoFocus
              className="w-full px-3.5 py-2.5 text-xs bg-surface-2 border border-border rounded-xl text-fg outline-none focus:border-primary/50 mb-4"
              placeholder="Recording Name..."
            />
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setRenameModalDoc(null)}
                className="px-4 py-2.5 text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-xl transition-colors min-h-[36px] cursor-pointer"
              >
                {t("btn_cancel")}
              </button>
              <button
                onClick={confirmRename}
                disabled={!renameValue.trim()}
                className="px-4 py-2.5 text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover disabled:opacity-40 rounded-xl transition-colors min-h-[36px] cursor-pointer"
              >
                {t("btn_save")}
              </button>
            </div>
          </Modal>
        )}

        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-fg-tertiary mb-1">
                {documents.length} {t("col_document").toLowerCase()}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-fg tracking-tight">
                {t("workspace_title")}
              </h1>
              <p className="text-xs sm:text-sm text-fg-secondary mt-1">
                {t("workspace_desc")}
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-surface hover:bg-surface-2 border border-border text-fg-secondary hover:text-fg transition-colors self-start sm:self-auto min-h-[36px] cursor-pointer"
            >
              <ArrowLeft size={14} weight="bold" />
              <span>{t("dashboard_title")}</span>
            </button>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <MagnifyingGlass
                size={15}
                className="text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2"
              />
              <label htmlFor="workspace-search" className="sr-only">{t("search_documents")}</label>
              <input
                id="workspace-search"
                type="text"
                placeholder={t("search_documents")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-surface-2 border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg self-start" role="group" aria-label={t("col_status")}>
              {(["all", "Completed", "Processing"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  aria-pressed={statusFilter === filter}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    statusFilter === filter
                      ? "bg-surface text-primary shadow-card"
                      : "text-fg-tertiary hover:text-fg"
                  }`}
                >
                  {filter === "all" ? t("filter_all") : filter === "Completed" ? t("filter_completed") : t("filter_processing")}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Grid */}
          {isLoading && filteredDocs.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <DocCardSkeleton key={i} />
              ))}
            </div>
          ) : !isLoading && filteredDocs.length === 0 ? (
            <EmptyState
              title={searchQuery ? t("search_no_match", { query: searchQuery }) : t("no_documents")}
              description={t("no_documents_desc")}
              action={
                !searchQuery && (
                  <button
                    onClick={() => navigate("/")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover transition-colors cursor-pointer"
                  >
                    <PlayCircle size={14} weight="duotone" />
                    {t("dashboard_title")}
                  </button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDocs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  openLabel={t("btn_open")}
                  onOpen={() => navigate(`/workspace/${doc.id}`)}
                  actions={renderKebab(doc)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    )
  }

  // VIEW 2: Dual Panel Studio View (Left: Player & Transcript, Right: AI Summary Editor)
  const docName = document.name
  const docDate = document.date
  const transcripts = document.transcripts || []

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background print:block print:overflow-visible print:h-auto">
      {/* Studio Top Control Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border bg-surface flex-shrink-0 print:hidden z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/workspace")}
            className="px-3 py-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors flex items-center gap-1.5 text-xs font-semibold min-h-[32px]"
            aria-label={t("btn_back")}
            title={t("btn_back")}
          >
            <ArrowLeft size={14} weight="bold" />
            <span className="hidden sm:inline">{t("btn_back")}</span>
          </button>
          <div className="w-px h-4 flex-shrink-0 bg-border" />

          {/* Active File Title & Status */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold font-display truncate text-fg">
                {docName}
              </p>
              <StatusBadge status={document.status} uploadProgress={document.uploadProgress} size="sm" />
            </div>
            <p className="text-[11px] font-mono text-fg-tertiary mt-0.5">
              {docDate}
            </p>
          </div>
        </div>
      </div>

      {/* Split Panels / Tabs for Mobile */}
      <div className="flex-1 flex flex-col overflow-hidden relative print:block print:overflow-visible print:h-auto">
        {/* Mobile Tabs Header */}
        <div className="md:hidden flex items-center border-b border-border bg-surface print:hidden">
          <button
            aria-pressed={activeTab === "transcript"}
            className={`flex-1 py-3 text-xs font-semibold font-display transition-colors border-b-2 ${
              activeTab === "transcript"
                ? "border-primary text-primary"
                : "border-transparent text-fg-secondary hover:text-fg"
            }`}
            onClick={() => setActiveTab("transcript")}
          >
            {t("transcript_title")}
          </button>
          <button
            aria-pressed={activeTab === "summary"}
            className={`flex-1 py-3 text-xs font-semibold font-display transition-colors border-b-2 ${
              activeTab === "summary"
                ? "border-primary text-primary"
                : "border-transparent text-fg-secondary hover:text-fg"
            }`}
            onClick={() => setActiveTab("summary")}
          >
            {t("summary_title")}
          </button>
        </div>

        {/* Desktop Split View: Left (Audio & Transcript) | Right (Summary) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:block print:overflow-visible print:h-auto">
          {/* Left Panel: Audio Player & Raw Transcript */}
          <div
            className={`w-full md:w-5/12 flex-col border-b md:border-b-0 md:border-r border-border bg-surface md:max-h-none overflow-hidden print:hidden ${
              activeTab === "transcript" ? "flex" : "hidden md:flex"
            }`}
          >
            <AudioPlayer
              audioUrl={document.audioUrl}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              durationSeconds={document.durationSec}
              onDownload={() => handleDownloadAudio(document)}
              isPlaying={isPlaying}
              onPlayingChange={setIsPlaying}
            />
            <TranscriptPanel
              entries={transcripts}
              currentTime={currentTime}
              onSeekTo={(secs) => setCurrentTime(secs)}
            />
          </div>

          {/* Right Panel: Executive AI Summary.
              On mobile the Summary tab keeps a COMPACT transport on top so
              playback survives switching tabs (same audio element as the
              full player — no double mount). */}
          <div
            className={`w-full md:w-7/12 flex-col overflow-hidden bg-background print:block print:w-full print:overflow-visible print:h-auto ${
              activeTab === "summary" ? "flex" : "hidden md:flex"
            }`}
          >
            <div className="md:hidden">
              <AudioPlayer
                compact
                audioUrl={document.audioUrl}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                durationSeconds={document.durationSec}
                onDownload={() => handleDownloadAudio(document)}
                isPlaying={isPlaying}
                onPlayingChange={setIsPlaying}
              />
            </div>
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
