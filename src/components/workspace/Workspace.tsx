import { useState, useMemo, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { DocumentItem } from "../../types"
import AudioPlayer from "./AudioPlayer"
import TranscriptPanel from "./TranscriptPanel"
import SummaryEditor from "./SummaryEditor"
import StatusBadge from "../dashboard/StatusBadge"
import RecentDocsTable from "../dashboard/RecentDocsTable"
import Modal from "../ui/Modal"
import { useToast } from "../ui/ToastContext"
import { useLanguage } from "../../context/LanguageContext"
import { downloadAudioFile } from "../../services/download"
import {
  ArrowLeft,
  DotsThreeVertical,
  PencilSimple,
  DownloadSimple,
  Copy,
  Trash,
  Quotes,
  Sparkle,
  HardDrives,
} from "@phosphor-icons/react"
import RetranscribeModal from "../modals/RetranscribeModal"

interface WorkspaceProps {
  documents: DocumentItem[]
  isLoading?: boolean
  onReSummarize: (id: string | number, customPrompt?: string) => void
  onDeleteDocument: (id: number | string) => void
  onRenameDocument: (id: number | string, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
  onUpdateSummary: (id: number | string, summary: DocumentItem["summary"]) => void
  onCancelUpload?: (id: number | string) => void
  onDeleteAudioOnly?: (id: number | string) => Promise<void> | void
  onRetranscribe?: (
    id: number | string,
    options: { language: string; prompt: string; regenerateSummary: boolean },
  ) => Promise<void> | void
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
  onDeleteAudioOnly,
  onRetranscribe,
}: WorkspaceProps) {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { showToast } = useToast()

  const [currentTime, setCurrentTime] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">("transcript")

  // Studio Action Menu & Modal States
  const [studioMenuOpen, setStudioMenuOpen] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteAudioModalOpen, setDeleteAudioModalOpen] = useState(false)
  const [isDeletingAudio, setIsDeletingAudio] = useState(false)
  const [retranscribeModalOpen, setRetranscribeModalOpen] = useState(false)

  // Close studio dropdown menu when clicking elsewhere or pressing Escape
  useEffect(() => {
    if (!studioMenuOpen) return
    const close = () => setStudioMenuOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStudioMenuOpen(false)
    window.addEventListener("click", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [studioMenuOpen])

  // Active document selected by route param
  const document = useMemo(() => {
    if (!id) return null
    return documents.find((d) => String(d.id) === String(id)) || null
  }, [id, documents])

  // Playback belongs to the document — reset when switching files
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setActiveTab("transcript")
  }, [document?.id])

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

  const confirmRename = () => {
    if (document && renameValue.trim()) {
      onRenameDocument(document.id, renameValue.trim())
      setRenameModalOpen(false)
    }
  }

  const confirmDeleteAudio = async () => {
    if (!document || !onDeleteAudioOnly) return
    try {
      setIsDeletingAudio(true)
      await onDeleteAudioOnly(document.id)
      setDeleteAudioModalOpen(false)
    } finally {
      setIsDeletingAudio(false)
    }
  }

  const confirmDeleteDocument = () => {
    if (document) {
      onDeleteDocument(document.id)
      setDeleteModalOpen(false)
      navigate("/workspace")
    }
  }

  // VIEW 1: Audio Library Hub (when no document is selected in studio)
  if (!document) {
    return (
      <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 animate-fade-in">
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

          {/* Unified Library Table & Grid with all features */}
          <RecentDocsTable
            documents={documents}
            isLoading={isLoading}
            onDeleteDocument={onDeleteDocument}
            onDeleteAudioOnly={onDeleteAudioOnly}
            onRenameDocument={onRenameDocument}
            onDuplicateDocument={onDuplicateDocument}
            showAllMode
            title=""
          />
        </div>
      </main>
    )
  }

  // VIEW 2: Dual Panel Studio View (Left: Player & Transcript, Right: AI Summary Editor)
  const docName = document.name
  const docDate = document.date
  const transcripts = document.transcripts || []
  const hasAudio = Boolean(document.audioUrl && document.audioUrl !== "Expired")

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background print:block print:overflow-visible print:h-auto print:bg-white">
      {/* Studio Top Control Bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-2.5 border-b border-border bg-surface flex-shrink-0 print:hidden z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate("/workspace")}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors flex items-center gap-1.5 text-xs font-semibold min-h-[36px] cursor-pointer flex-shrink-0"
            aria-label={t("btn_back")}
            title={t("btn_back")}
          >
            <ArrowLeft size={15} weight="bold" />
            <span className="hidden sm:inline">{t("btn_back")}</span>
          </button>
          <div className="w-px h-4 flex-shrink-0 bg-border" />

          {/* Active File Title & Status */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs sm:text-sm font-bold font-display truncate text-fg flex-1 min-w-0">
                {docName}
              </p>
              <StatusBadge status={document.status} uploadProgress={document.uploadProgress} size="sm" />
            </div>
            <p className="text-[10px] sm:text-[11px] font-mono text-fg-tertiary mt-0.5 truncate">
              {docDate}
            </p>
          </div>
        </div>

        {/* Studio Document Action Kebab Menu */}
        <div className="relative flex-shrink-0">
          <button
            className="w-9 h-9 rounded-lg flex items-center justify-center text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              setStudioMenuOpen((prev) => !prev)
            }}
            aria-label={t("a11y_more_options")}
            title={t("a11y_more_options")}
            aria-expanded={studioMenuOpen}
            aria-haspopup="menu"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>

          {studioMenuOpen && (
            <div
              className="absolute right-0 mt-1.5 w-48 rounded-xl bg-surface border border-border shadow-raised py-1.5 z-50 animate-scale-in"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                onClick={() => {
                  setStudioMenuOpen(false)
                  setRenameValue(document.name)
                  setRenameModalOpen(true)
                }}
              >
                <PencilSimple size={15} weight="duotone" />
                <span>{t("action_rename")}</span>
              </button>
              <button
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                onClick={() => {
                  setStudioMenuOpen(false)
                  onDuplicateDocument(document)
                }}
              >
                <Copy size={15} weight="duotone" />
                <span>{t("action_duplicate")}</span>
              </button>
              {hasAudio && (
                <button
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                  onClick={async () => {
                    setStudioMenuOpen(false)
                    await handleDownloadAudio(document)
                  }}
                >
                  <DownloadSimple size={15} weight="duotone" />
                  <span>{t("action_download")}</span>
                </button>
              )}
              {hasAudio && onDeleteAudioOnly && (
                <button
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                  onClick={() => {
                    setStudioMenuOpen(false)
                    setDeleteAudioModalOpen(true)
                  }}
                >
                  <HardDrives size={15} weight="duotone" />
                  <span>{t("action_delete_audio")}</span>
                </button>
              )}
              <div className="my-1 mx-2 h-px bg-border" />
              <button
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-danger hover:bg-danger-dim transition-colors cursor-pointer"
                onClick={() => {
                  setStudioMenuOpen(false)
                  setDeleteModalOpen(true)
                }}
              >
                <Trash size={15} weight="duotone" />
                <span>{t("action_delete")}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Split Panels / Tabs for Mobile */}
      <div className="flex-1 flex flex-col overflow-hidden relative print:block print:overflow-visible print:h-auto print:bg-white">
        {/* Mobile Tabs Header */}
        <div className="md:hidden flex items-center border-b border-border bg-surface print:hidden px-2 gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "transcript"}
            className={`flex-1 py-2.5 px-3 text-xs font-semibold font-display transition-all flex items-center justify-center gap-2 border-b-2 min-h-[44px] cursor-pointer ${
              activeTab === "transcript"
                ? "border-primary text-primary bg-primary-dim/30"
                : "border-transparent text-fg-secondary hover:text-fg"
            }`}
            onClick={() => setActiveTab("transcript")}
          >
            <Quotes size={15} weight="duotone" />
            <span>{t("transcript_title")}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "summary"}
            className={`flex-1 py-2.5 px-3 text-xs font-semibold font-display transition-all flex items-center justify-center gap-2 border-b-2 min-h-[44px] cursor-pointer ${
              activeTab === "summary"
                ? "border-primary text-primary bg-primary-dim/30"
                : "border-transparent text-fg-secondary hover:text-fg"
            }`}
            onClick={() => setActiveTab("summary")}
          >
            <Sparkle size={15} weight="duotone" />
            <span>{t("summary_title")}</span>
          </button>
        </div>

        {/* Desktop Split View: Left (Audio & Transcript) | Right (Summary) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:block print:overflow-visible print:h-auto print:bg-white">
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
              onDeleteAudio={() => setDeleteAudioModalOpen(true)}
              isPlaying={isPlaying}
              onPlayingChange={setIsPlaying}
            />
            <TranscriptPanel
              entries={transcripts}
              currentTime={currentTime}
              onSeekTo={(secs) => setCurrentTime(secs)}
              docName={docName}
              docDate={docDate}
              onRetranscribe={() => setRetranscribeModalOpen(true)}
              hasAudio={hasAudio}
            />
          </div>

          {/* Right Panel: Executive AI Summary */}
          <div
            className={`w-full md:w-7/12 flex-col overflow-hidden bg-background print:block print:w-full print:overflow-visible print:h-auto print:bg-white ${
              activeTab === "summary" ? "flex" : "hidden md:flex"
            }`}
          >
            <div className="md:hidden print:hidden">
              <AudioPlayer
                compact
                audioUrl={document.audioUrl}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                durationSeconds={document.durationSec}
                onDownload={() => handleDownloadAudio(document)}
                onDeleteAudio={() => setDeleteAudioModalOpen(true)}
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

      {/* Retranscribe Language Selection Modal */}
      {document && (
        <RetranscribeModal
          open={retranscribeModalOpen}
          docName={document.name}
          onClose={() => setRetranscribeModalOpen(false)}
          onSubmit={async (options) => {
            if (onRetranscribe) {
              await onRetranscribe(document.id, options)
            }
          }}
        />
      )}

      {/* Delete Audio Confirmation Modal */}
      {deleteAudioModalOpen && document && (
        <Modal
          onClose={() => !isDeletingAudio && setDeleteAudioModalOpen(false)}
          labelledBy="delete-audio-modal-title"
          panelClassName="bg-surface border border-amber-500/25 w-full max-w-sm rounded-xl p-6 shadow-raised animate-scale-in"
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-4 text-amber-500">
            <HardDrives size={24} weight="duotone" />
          </div>
          <h3 id="delete-audio-modal-title" className="text-base sm:text-lg font-bold font-display text-fg mb-1">
            {t("modal_delete_audio_title")}
          </h3>
          <p className="text-xs text-fg-secondary mb-3 leading-relaxed">
            {t("modal_delete_audio_desc")}{" "}
            <span className="font-semibold text-fg">"{document.name}"</span>?
          </p>
          <div className="p-3 mb-5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/90 leading-relaxed">
            ⚠️ {t("modal_delete_audio_warning")}
          </div>
          <div className="flex gap-2.5 justify-end">
            <button
              onClick={() => setDeleteAudioModalOpen(false)}
              disabled={isDeletingAudio}
              className="px-4 py-2.5 text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-xl transition-colors min-h-[36px] cursor-pointer disabled:opacity-50"
            >
              {t("btn_cancel")}
            </button>
            <button
              onClick={confirmDeleteAudio}
              disabled={isDeletingAudio}
              className="px-4 py-2.5 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors min-h-[36px] cursor-pointer disabled:opacity-50"
            >
              {isDeletingAudio ? t("btn_deleting") : t("action_delete_audio")}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Document Confirmation Modal */}
      {deleteModalOpen && document && (
        <Modal
          onClose={() => setDeleteModalOpen(false)}
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
            <span className="font-semibold text-fg">"{document.name}"</span>? {t("modal_delete_subdesc")}
          </p>
          <div className="flex gap-2.5 justify-end">
            <button
              onClick={() => setDeleteModalOpen(false)}
              autoFocus
              className="px-4 py-2.5 text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border rounded-xl transition-colors min-h-[36px] cursor-pointer"
            >
              {t("btn_cancel")}
            </button>
            <button
              onClick={confirmDeleteDocument}
              className="px-4 py-2.5 text-xs font-semibold text-danger-contrast bg-danger hover:bg-danger/90 rounded-xl transition-colors min-h-[36px] cursor-pointer"
            >
              {t("btn_delete")}
            </button>
          </div>
        </Modal>
      )}

      {/* Rename Document Modal */}
      {renameModalOpen && document && (
        <Modal
          onClose={() => setRenameModalOpen(false)}
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
              if (e.key === "Escape") setRenameModalOpen(false)
            }}
            autoFocus
            className="w-full px-3.5 py-2.5 text-xs bg-surface-2 border border-border rounded-xl text-fg outline-none focus:border-primary/50 mb-4"
            placeholder={t("modal_rename_placeholder")}
          />
          <div className="flex gap-2.5 justify-end">
            <button
              onClick={() => setRenameModalOpen(false)}
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
    </div>
  )
}
