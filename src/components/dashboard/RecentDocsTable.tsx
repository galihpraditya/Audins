import { useState, useMemo, useEffect, MouseEvent } from "react"
import { useNavigate } from "react-router-dom"
import { DocumentItem } from "../../types"
import StatusBadge from "./StatusBadge"
import DocCard, { DocCardSkeleton } from "./DocCard"
import EmptyState, { EmptyStateSkeleton } from "../ui/EmptyState"
import Modal from "../ui/Modal"
import { useToast } from "../ui/ToastContext"
import { useLanguage } from "../../context/LanguageContext"
import { downloadAudioFile } from "../../services/download"
import {
  DotsThreeVertical,
  PencilSimple,
  DownloadSimple,
  Copy,
  Trash,
  HardDrives,
  FileAudio,
  MagnifyingGlass,
  GridFour,
  Rows,
  ArrowRight,
} from "@phosphor-icons/react"

interface RecentDocsTableProps {
  documents: DocumentItem[]
  isLoading?: boolean
  onDeleteDocument: (id: number | string) => void
  onDeleteAudioOnly?: (id: number | string) => Promise<void> | void
  onRenameDocument: (id: number | string, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
  showAllMode?: boolean
  title?: string
}

export default function RecentDocsTable({
  documents,
  isLoading = false,
  onDeleteDocument,
  onDeleteAudioOnly,
  onRenameDocument,
  onDuplicateDocument,
  showAllMode = false,
  title,
}: RecentDocsTableProps) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { showToast } = useToast()
  const [openMenuId, setOpenMenuId] = useState<number | string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    try {
      return (localStorage.getItem("audin_dashboard_view") as "grid" | "table") || "grid"
    } catch {
      return "grid"
    }
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "Completed" | "Processing">("all")

  const [deleteModalDoc, setDeleteModalDoc] = useState<DocumentItem | null>(null)
  const [deleteAudioModalDoc, setDeleteAudioModalDoc] = useState<DocumentItem | null>(null)
  const [isDeletingAudio, setIsDeletingAudio] = useState(false)
  const [renameModalDoc, setRenameModalDoc] = useState<DocumentItem | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Close any open dropdown when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (openMenuId === null) return
    const close = () => setOpenMenuId(null)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenuId(null)
    document.addEventListener("click", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [openMenuId])

  const toggleViewMode = (mode: "grid" | "table") => {
    setViewMode(mode)
    try {
      localStorage.setItem("audin_dashboard_view", mode)
    } catch {
      /* non-fatal */
    }
  }

  const filteredDocs = useMemo(
    () =>
      documents.filter((doc) => {
        const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesStatus = statusFilter === "all" || doc.status === statusFilter
        return matchesSearch && matchesStatus
      }),
    [documents, searchQuery, statusFilter],
  )

  // The persisted view mode may be "table" while the toggle itself is hidden
  // on phones â€” force the mobile-friendly grid there.
  const isMobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
  const effectiveViewMode = isMobileViewport ? "grid" : viewMode

  const handleOpenDoc = (doc: DocumentItem) => {
    navigate(`/workspace/${doc.id}`)
  }

  const handleCardKeyDown = (e: React.KeyboardEvent, doc: DocumentItem) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleOpenDoc(doc)
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
    } else if (action === "delete_audio") {
      setDeleteAudioModalDoc(doc)
    } else if (action === "delete") {
      setDeleteModalDoc(doc)
    }
  }

  /** Kebab dropdown rendered into DocCard's action slot. */
  const renderKebab = (doc: DocumentItem) => (
    <div className="relative">
      <button
        className="w-9 h-9 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors"
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
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
              onClick={(e) => handleActionClick(e, act.id, doc)}
            >
              {act.icon}
              <span>{act.text}</span>
            </button>
          ))}
          {doc.audioUrl && doc.audioUrl !== "Expired" && (
            <button
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-amber-500 hover:bg-amber-500/10 transition-colors"
              onClick={(e) => handleActionClick(e, "delete_audio", doc)}
            >
              <HardDrives size={15} weight="duotone" />
              <span>{t("action_delete_audio")}</span>
            </button>
          )}
          <div className="my-1 mx-2 h-px bg-border" />
          <button
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-danger hover:bg-danger-dim transition-colors"
            onClick={(e) => handleActionClick(e, "delete", doc)}
          >
            <Trash size={15} weight="duotone" />
            <span>{t("action_delete")}</span>
          </button>
        </div>
      )}
    </div>
  )

  const confirmDelete = () => {
    if (deleteModalDoc) {
      onDeleteDocument(deleteModalDoc.id)
      setDeleteModalDoc(null)
    }
  }

  const confirmDeleteAudio = async () => {
    if (!deleteAudioModalDoc || !onDeleteAudioOnly) return
    try {
      setIsDeletingAudio(true)
      await onDeleteAudioOnly(deleteAudioModalDoc.id)
      setDeleteAudioModalDoc(null)
    } finally {
      setIsDeletingAudio(false)
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
  const isSearchingOrFiltering = searchQuery.trim().length > 0 || statusFilter !== "all"
  const displayedDocs = (showAllMode || isSearchingOrFiltering) ? filteredDocs : filteredDocs.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Delete confirmation modal */}
      {deleteModalDoc && (
        <Modal onClose={() => setDeleteModalDoc(null)} labelledBy="delete-modal-title" panelClassName="bg-surface border border-danger/25 w-full max-w-sm rounded-xl p-6 shadow-raised animate-scale-in">
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

      {/* Delete Audio confirmation modal */}
      {deleteAudioModalDoc && (
        <Modal
          onClose={() => !isDeletingAudio && setDeleteAudioModalDoc(null)}
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
            <span className="font-semibold text-fg">"{deleteAudioModalDoc.name}"</span>?
          </p>
          <div className="p-3 mb-5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/90 leading-relaxed">
            ⚠️ {t("modal_delete_audio_warning")}
          </div>
          <div className="flex gap-2.5 justify-end">
            <button
              onClick={() => setDeleteAudioModalDoc(null)}
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

      {/* Rename modal */}
      {renameModalDoc && (
        <Modal onClose={() => setRenameModalDoc(null)} labelledBy="rename-modal-title" panelClassName="bg-surface border border-border w-full max-w-sm rounded-2xl p-6 shadow-raised animate-scale-in">
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
            placeholder={t("modal_rename_placeholder")}
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

      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          {title !== undefined ? (
            title ? (
              <h2 className="text-base sm:text-lg font-bold font-display text-fg tracking-tight">
                {title}
              </h2>
            ) : null
          ) : (
            <h2 className="text-base sm:text-lg font-bold font-display text-fg tracking-tight">
              {showAllMode ? t("workspace_library_title") : t("recent_documents")}
            </h2>
          )}
        </div>

        {/* Search, Filter, View Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5">
          <div className="relative w-full sm:w-64">
            <MagnifyingGlass
              size={15}
              className="text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <label htmlFor="search-documents" className="sr-only">
              {t("search_documents")}
            </label>
            <input
              id="search-documents"
              type="text"
              placeholder={t("search_documents")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 sm:py-1.5 rounded-lg text-xs bg-surface-2 border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary/50 transition-colors min-h-[36px]"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2">
            <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg flex-1 sm:flex-none justify-center" role="group" aria-label={t("col_status")}>
              {(["all", "Completed", "Processing"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  aria-pressed={statusFilter === filter}
                  className={`flex-1 sm:flex-none px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer text-center ${statusFilter === filter
                      ? "bg-surface text-primary shadow-card"
                      : "text-fg-tertiary hover:text-fg"
                    }`}
                >
                  {filter === "all" ? t("filter_all") : filter === "Completed" ? t("filter_completed") : t("filter_processing")}
                </button>
              ))}
            </div>

            {/* Grid / Table Toggle — hidden on small viewports */}
            <div className="hidden sm:flex items-center gap-1 bg-surface-2 p-1 rounded-lg" role="group" aria-label={t("a11y_view_mode")}>
            <button
              onClick={() => toggleViewMode("grid")}
              aria-pressed={effectiveViewMode === "grid"}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${effectiveViewMode === "grid"
                  ? "bg-surface text-primary shadow-card"
                  : "text-fg-tertiary hover:text-fg"
                }`}
              title={t("a11y_grid_view")}
              aria-label={t("a11y_grid_view")}
            >
              <GridFour size={15} weight="duotone" />
            </button>
            <button
              onClick={() => toggleViewMode("table")}
              aria-pressed={effectiveViewMode === "table"}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${effectiveViewMode === "table"
                  ? "bg-surface text-primary shadow-card"
                  : "text-fg-tertiary hover:text-fg"
                }`}
              title={t("a11y_table_view")}
              aria-label={t("a11y_table_view")}
            >
              <Rows size={15} weight="duotone" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Main Content Area */}
      {isLoading && displayedDocs.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <DocCardSkeleton key={i} />
          ))}
        </div>
      ) : !isLoading && displayedDocs.length === 0 ? (
        <EmptyState
          title={t("no_documents")}
          description={
            searchQuery
              ? t("search_no_match", { query: searchQuery })
              : t("no_documents_desc")
          }
        />
      ) : effectiveViewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayedDocs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              openLabel={t("btn_open")}
              onOpen={() => handleOpenDoc(doc)}
              actions={renderKebab(doc)}
            />
          ))}
        </div>
      ) : (
        /* Data Table View — horizontally scrollable on narrow screens */
        <div className="rounded-xl overflow-x-auto border border-border bg-surface">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/60">
                {[t("col_document"), t("col_date"), t("col_duration"), t("col_status"), t("col_actions")].map((col, i) => (
                  <th
                    key={col}
                    className="text-left px-5 py-3.5 text-[11px] font-mono font-semibold text-fg-tertiary tracking-wider uppercase"
                    style={{ width: i === 0 ? "auto" : i === 4 ? "80px" : "140px" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedDocs.map((doc) => (
                <tr
                  key={doc.id}
                  tabIndex={0}
                  aria-label={doc.name}
                  onClick={() => handleOpenDoc(doc)}
                  onKeyDown={(e) => handleCardKeyDown(e, doc)}
                  className="group transition-all duration-150 hover:bg-surface-3/50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-invert"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-fg-tertiary group-hover:text-primary transition-colors flex-shrink-0">
                        <FileAudio size={16} weight="duotone" />
                      </div>
                      <span className="font-semibold text-fg group-hover:text-primary transition-colors truncate max-w-sm">
                        {doc.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs font-mono text-fg-secondary">
                    {doc.date}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs font-mono text-fg-secondary">
                    {doc.duration}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusBadge status={doc.status} uploadProgress={doc.uploadProgress} size="sm" />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="relative">
                      <button
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenMenuId(openMenuId === doc.id ? null : doc.id)
                        }}
                        aria-label={t("a11y_more_options")}
                        title={t("a11y_more_options")}
                        aria-expanded={openMenuId === doc.id}
                        aria-haspopup="menu"
                      >
                        <DotsThreeVertical size={16} weight="bold" />
                      </button>

                      {openMenuId === doc.id && (
                        <div
                          className="absolute right-0 top-[calc(100%+4px)] z-50 rounded-xl bg-surface border border-border shadow-raised py-1.5 min-w-[150px] animate-scale-in"
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
                          {doc.audioUrl && doc.audioUrl !== "Expired" && (
                            <button
                              role="menuitem"
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                              onClick={(e) => handleActionClick(e, "delete_audio", doc)}
                            >
                              <HardDrives size={14} weight="duotone" />
                              <span>{t("action_delete_audio")}</span>
                            </button>
                          )}
                          <div className="my-1 mx-2 h-px bg-border" />
                          <button
                            role="menuitem"
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-danger hover:bg-danger-dim transition-colors cursor-pointer"
                            onClick={(e) => handleActionClick(e, "delete", doc)}
                          >
                            <Trash size={14} weight="duotone" />
                            <span>{t("action_delete")}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Show All Link Button on Dashboard */}
      {!showAllMode && filteredDocs.length > 6 && !isSearchingOrFiltering && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => navigate("/workspace")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-fg hover:text-primary transition-all shadow-sm group cursor-pointer"
          >
            <span>{t("btn_show_all_documents")}</span>
            <ArrowRight size={14} weight="bold" className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}
    </div>
  )
}
