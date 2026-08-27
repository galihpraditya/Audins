import { useState, useRef, DragEvent, ChangeEvent } from "react"
import { useLanguage } from "../../context/LanguageContext"
import { CloudArrowUp, Microphone, ShieldCheck, FolderOpen } from "@phosphor-icons/react"

interface UploadZoneProps {
  onUploadFile: (file: File) => void
  onOpenLiveRecorder: () => void
  onShowLimitModal: () => void
  uploadCount: number
  maxUploads?: number
  hasCustomKey?: boolean
}

export default function UploadZone({
  onUploadFile,
  onOpenLiveRecorder,
  onShowLimitModal,
  uploadCount,
  maxUploads = 10,
  hasCustomKey = false,
}: UploadZoneProps) {
  const { t } = useLanguage()
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // dragenter/dragleave counter: hovering child elements toggles enter/leave
  // events, which previously made the highlight flicker or stick.
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current += 1
    setDragging(true)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    if (!hasCustomKey && uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      onUploadFile(file)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]

    // Reset so selecting the same file again in the future re-triggers change.
    e.target.value = ""

    if (!hasCustomKey && uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }

    onUploadFile(file)
  }

  const handleBrowseClick = () => {
    if (!hasCustomKey && uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }
    fileInputRef.current?.click()
  }

  const handleRecordClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!hasCustomKey && uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }
    onOpenLiveRecorder()
  }

  return (
    <div
      className={`relative rounded-xl transition-colors duration-200 mb-6 sm:mb-8 border border-dashed ${
        dragging
          ? "border-primary bg-primary-dim"
          : "border-border bg-surface hover:border-border-hover"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="region"
      aria-label="Upload or record audio"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.webm,.aac,.flac,.ogg,.opus"
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-6 sm:px-10 text-center">
        {/* Icon */}
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-surface-2 border flex items-center justify-center mb-5 transition-colors duration-200 ${
            dragging ? "border-primary/40 text-primary" : "border-border text-fg-tertiary"
          }`}
        >
          <CloudArrowUp size={30} weight="duotone" />
        </div>

        {/* Title & Description */}
        <h2 className="text-base sm:text-lg font-bold font-display tracking-tight text-fg mb-1.5">
          {dragging ? t("upload_drop_title") : t("upload_title")}
        </h2>
        <p className="text-xs sm:text-sm text-fg-secondary max-w-md mb-6 leading-relaxed">
          {t("upload_desc")}
        </p>

        {/* Action Buttons: Browse File + Record Live Audio */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-6">
          <button
            onClick={handleBrowseClick}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-contrast transition-colors flex items-center gap-2 min-h-[38px] shadow-sm cursor-pointer"
          >
            <FolderOpen size={15} weight="duotone" />
            <span>{t("browse_device")}</span>
          </button>

          <button
            onClick={handleRecordClick}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-surface hover:bg-surface-2 border border-border hover:border-danger/40 text-fg-secondary hover:text-danger transition-colors flex items-center gap-2 min-h-[38px]"
          >
            <Microphone size={15} weight="duotone" className="text-danger" />
            <span>{t("btn_record_live")}</span>
          </button>
        </div>

        {/* Supported Formats — quiet mono line */}
        <p className="text-[11px] font-mono text-fg-tertiary tracking-wide mb-2.5">
          {["MP3", "WAV", "M4A", "MP4", "WebM", "AAC", "FLAC"].join(" · ")}
        </p>

        {/* File limit note */}
        <div className="inline-flex items-center gap-1.5 text-[11px] text-fg-tertiary font-mono">
          <ShieldCheck size={13} className="text-primary" weight="bold" />
          <span>{t("max_file_size")}</span>
        </div>
      </div>
    </div>
  )
}
