import { useState, MouseEvent } from "react"
import { DocumentItem } from "../../types"
import StatusBadge from "./StatusBadge"
import { useToast } from "../ui/ToastContext"
import { API_BASE_URL } from "../../services/api"

interface RecentDocsTableProps {
  documents: DocumentItem[]
  onOpenDocument: (doc: DocumentItem) => void
  onDeleteDocument: (id: number) => void
  onRenameDocument: (id: number, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
}

export default function RecentDocsTable({
  documents,
  onOpenDocument,
  onDeleteDocument,
  onRenameDocument,
  onDuplicateDocument,
}: RecentDocsTableProps) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const { showToast } = useToast()

  const [deleteModalDoc, setDeleteModalDoc] = useState<DocumentItem | null>(
    null,
  )
  const [renameModalDoc, setRenameModalDoc] = useState<DocumentItem | null>(
    null,
  )
  const [renameValue, setRenameValue] = useState("")

  const handleActionClick = async (
    e: MouseEvent,
    action: string,
    doc: DocumentItem,
  ) => {
    e.stopPropagation()
    setOpenMenuId(null)

    if (action === "Rename") {
      setRenameValue(doc.name)
      setRenameModalDoc(doc)
    } else if (action === "Duplicate") {
      onDuplicateDocument(doc)
      showToast(`Duplicated "${doc.name}"`, "success")
    } else if (action === "Download") {
      if (!doc.audioUrl) {
        showToast("Audio file not found", "error")
        return
      }

      // Ensure filename ends with correct format extension
      let filename = doc.name.trim()
      const extRegex = /\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i
      if (!extRegex.test(filename)) {
        const urlExtMatch = doc.audioUrl.match(extRegex)
        const ext = urlExtMatch ? urlExtMatch[0] : ".mp3"
        filename = `${filename}${ext}`
      }

      showToast(`Downloading "${filename}"...`, "info")

      try {
        // Use backend proxy to avoid CORS issues with cloud storage
        const proxyUrl = `${API_BASE_URL}/documents/${doc.id}/download`
        const res = await fetch(proxyUrl, {
          headers: { "X-User-Session": localStorage.getItem("audin_session_id") || "" },
        })
        if (!res.ok) throw new Error("Download failed")
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => window.URL.revokeObjectURL(url), 1000)
        showToast(`Downloaded "${filename}" successfully`, "success")
      } catch (err) {
        console.error("Download failed:", err)
        showToast("Download failed. Please try again.", "error")
      }
    } else if (action === "Delete") {
      setDeleteModalDoc(doc)
    }
  }

  const confirmDelete = () => {
    if (deleteModalDoc) {
      onDeleteDocument(deleteModalDoc.id as number)
      showToast(`Deleted "${deleteModalDoc.name}"`, "success")
      setDeleteModalDoc(null)
    }
  }

  const confirmRename = () => {
    if (renameModalDoc && renameValue.trim()) {
      onRenameDocument(renameModalDoc.id as number, renameValue.trim())
      showToast(`Renamed to "${renameValue.trim()}"`, "success")
      setRenameModalDoc(null)
    }
  }

  return (
    <div onClick={() => setOpenMenuId(null)}>
      {/* Modals */}
      {deleteModalDoc && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-in">
            <h3 className="text-lg font-semibold text-fg mb-2">
              Delete Document
            </h3>
            <p className="text-sm text-fg-secondary mb-6">
              Are you sure you want to delete "{deleteModalDoc.name}"? This
              action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModalDoc(null)}
                className="px-4 py-2 text-sm font-medium text-fg-secondary bg-surface-2 hover:bg-surface border border-border rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {renameModalDoc && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-in">
            <h3 className="text-lg font-semibold text-fg mb-4">
              Rename Document
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2 text-sm text-fg mb-6 outline-none focus:border-primary"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmRename()}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRenameModalDoc(null)}
                className="px-4 py-2 text-sm font-medium text-fg-secondary bg-surface-2 hover:bg-surface border border-border rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmRename}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-xl shadow-sm transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm sm:text-base font-semibold font-display text-fg">
          Recent Documents ({documents.length})
        </h2>
        <p className="text-xs text-fg-tertiary">
          Click any file to open workspace
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-2xl p-8 text-center border border-border bg-surface">
          <p className="text-sm text-fg-tertiary">
            No documents found. Upload an audio file above to get started!
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-2xl overflow-visible border border-border bg-surface">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {[
                    "FILE NAME",
                    "UPLOAD DATE",
                    "DURATION",
                    "STATUS",
                    "ACTIONS",
                  ].map((col, i) => (
                    <th
                      key={col}
                      className="text-left px-5 py-3 text-xs font-mono font-medium text-fg-tertiary tracking-wider"
                      style={{
                        width: i === 0 ? "auto" : i === 4 ? "70px" : "130px",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, i) => (
                  <tr
                    key={doc.id}
                    onClick={() => onOpenDocument(doc)}
                    className={`group transition-all duration-150 bg-surface-2 hover:bg-indigo-500/10 cursor-pointer ${
                      i < documents.length - 1
                        ? "border-b border-border-subtle"
                        : ""
                    }`}
                  >
                    {/* File name with music/audio icon */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary-dim border border-indigo-500/20 group-hover:border-indigo-500/40 group-hover:scale-105 transition-all">
                          {/* Music Audio Note Icon */}
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="w-4 h-4 text-primary"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zM9 10l12-3"
                            />
                          </svg>
                        </div>
                        <span className="font-medium truncate max-w-xs text-fg group-hover:text-primary-hover transition-colors">
                          {doc.name}
                        </span>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs font-mono text-fg-secondary">
                      {doc.date}
                    </td>

                    {/* Duration */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs font-mono text-fg-secondary">
                      {doc.duration}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge status={doc.status} uploadProgress={doc.uploadProgress} />
                    </td>

                    {/* Actions Kebab Menu */}
                    <td className="px-5 py-3.5">
                      <div className="relative">
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface border border-transparent hover:border-border transition-all"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === doc.id ? null : doc.id)
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

                        {openMenuId === doc.id && (
                          <div
                            className="absolute right-0 z-50 rounded-xl overflow-hidden bg-surface border border-border shadow-2xl animate-scale-in min-w-[156px] top-[calc(100%+4px)]"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack (entire card clickable) */}
          <div className="sm:hidden space-y-2.5">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onOpenDocument(doc)}
                className="rounded-2xl p-4 bg-surface border border-border hover:border-indigo-500/40 hover:bg-surface-2 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-primary-dim border border-indigo-500/20 group-hover:scale-105 transition-transform">
                    {/* Music Audio Note Icon */}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-4 h-4 text-primary"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 .895-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug truncate text-fg group-hover:text-primary-hover transition-colors">
                      {doc.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      <span className="text-xs font-mono text-fg-tertiary">
                        {doc.date}
                      </span>
                      <span className="text-xs font-mono text-fg-tertiary">
                        ·
                      </span>
                      <span className="text-xs font-mono text-fg-tertiary">
                        {doc.duration}
                      </span>
                      <StatusBadge status={doc.status} />
                    </div>
                  </div>
                  <div className="text-fg-tertiary group-hover:text-primary-hover transition-colors pt-1">
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
                        d="M6 12l4-4-4-4"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
