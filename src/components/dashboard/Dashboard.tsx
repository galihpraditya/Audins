import { DocumentItem } from "../../types"
import UploadZone from "./UploadZone"
import RecentDocsTable from "./RecentDocsTable"
import { useLanguage } from "../../context/LanguageContext"

interface DashboardProps {
  documents: DocumentItem[]
  isLoading?: boolean
  onUploadFile: (file: File) => void
  onOpenLiveRecorder: () => void
  onDeleteDocument: (id: number | string) => void
  onDeleteAudioOnly?: (id: number | string) => Promise<void> | void
  onRenameDocument: (id: number | string, newName: string) => void
  onDuplicateDocument: (doc: DocumentItem) => void
  onUpdateDocument?: (doc: DocumentItem) => void
  setModal: (v: boolean) => void
  uploadCount: number
  maxUploads?: number
  hasCustomKey?: boolean
}

export default function Dashboard({
  documents,
  isLoading,
  onUploadFile,
  onOpenLiveRecorder,
  onDeleteDocument,
  onDeleteAudioOnly,
  onRenameDocument,
  onDuplicateDocument,
  onUpdateDocument,
  setModal,
  uploadCount,
  maxUploads,
  hasCustomKey,
}: DashboardProps) {
  const { t } = useLanguage()

  return (
    <main className="flex-1 overflow-y-auto relative bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in space-y-6 sm:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-fg tracking-tight">
            {t("dashboard_title")}
          </h1>
          <p className="text-xs sm:text-sm text-fg-secondary mt-1">
            {t("dashboard_desc")}
          </p>
        </div>

        {/* Upload & Live Record Zone */}
        <UploadZone
          onUploadFile={onUploadFile}
          onOpenLiveRecorder={onOpenLiveRecorder}
          onShowLimitModal={() => setModal(true)}
          uploadCount={uploadCount}
          maxUploads={maxUploads}
          hasCustomKey={hasCustomKey}
        />

        {/* Recent Documents Section */}
        <RecentDocsTable
          documents={documents}
          isLoading={isLoading}
          onDeleteDocument={onDeleteDocument}
          onDeleteAudioOnly={onDeleteAudioOnly}
          onRenameDocument={onRenameDocument}
          onDuplicateDocument={onDuplicateDocument}
          onUpdateDocument={onUpdateDocument}
        />
      </div>
    </main>
  )
}
