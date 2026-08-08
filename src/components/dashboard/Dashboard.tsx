import { DocumentItem } from "../../types"
import UploadZone from "./UploadZone"
import RecentDocsTable from "./RecentDocsTable"
import { useToast } from "../ui/ToastContext"

interface DashboardProps {
  documents: DocumentItem[]
  onOpenDocument: (doc: DocumentItem) => void
  onUploadFile: (file: File) => void
  onDeleteDocument: (id: number) => void
  onRenameDocument: (id: number, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
  setModal: (v: boolean) => void
  uploadCount: number
}

export default function Dashboard({
  documents,
  onOpenDocument,
  onUploadFile,
  onDeleteDocument,
  onRenameDocument,
  onDuplicateDocument,
  setModal,
  uploadCount,
}: DashboardProps) {
  const { showToast } = useToast()

  return (
    <main className="flex-1 overflow-y-auto relative bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold mb-1 font-display text-fg tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-fg-secondary">
            Upload and manage your audio & video files for AI transcription and
            intelligence.
          </p>
        </div>

        {/* Upload Zone */}
        <UploadZone
          onUploadFile={onUploadFile}
          onShowLimitModal={() => setModal(true)}
          uploadCount={uploadCount}
        />

        {/* Recent Documents */}
        <RecentDocsTable
          documents={documents}
          onOpenDocument={onOpenDocument}
          onDeleteDocument={onDeleteDocument}
          onRenameDocument={onRenameDocument}
          onDuplicateDocument={onDuplicateDocument}
        />
      </div>

      {/* Help FAB */}
      <button
        className="fixed bottom-5 right-5 w-9 h-9 rounded-full flex items-center justify-center bg-surface border border-border text-fg-tertiary hover:border-indigo-500/40 hover:text-primary-hover hover:scale-105 transition-all duration-150 shadow-xl z-40"
        aria-label="Help and documentation"
        title="Help & Documentation"
        onClick={() =>
          showToast(
            "Audin AI Help & Documentation: Drag & drop audio/video files to transcribe and generate summaries!",
            "info",
          )
        }
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-4 h-4"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.25 6.25a1.75 1.75 0 013.5 0c0 1-1.75 1.5-1.75 2.5"
          />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </main>
  )
}
