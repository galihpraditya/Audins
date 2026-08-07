import { useState, useRef, DragEvent, ChangeEvent } from 'react'

interface UploadZoneProps {
  onUploadFile: (file: File) => void
  onShowLimitModal: () => void
  uploadCount: number
  maxUploads?: number
}

export default function UploadZone({ onUploadFile, onShowLimitModal, uploadCount, maxUploads = 5 }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => {
    setDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      onUploadFile(file)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      onUploadFile(file)
    }
  }

  const handleClick = () => {
    if (uploadCount >= maxUploads) {
      onShowLimitModal()
      return
    }
    fileInputRef.current?.click()
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer mb-8 sm:mb-10 group ${
        dragging
          ? 'border-primary bg-indigo-500/10'
          : 'border-border bg-surface hover:border-indigo-500/40 hover:bg-surface-2'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Upload audio or video file"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.webm,.aac"
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-6 sm:px-8 text-center">
        {/* Icon */}
        <div
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl mb-4 sm:mb-5 flex items-center justify-center transition-all duration-200 border border-border ${
            dragging ? 'bg-indigo-500/20' : 'bg-surface-2 group-hover:scale-105'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`w-5 h-5 sm:w-6 sm:h-6 transition-colors ${
              dragging ? 'text-primary-hover' : 'text-fg-secondary group-hover:text-primary-hover'
            }`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        <p className="text-sm sm:text-base font-medium mb-1.5 text-fg">
          Drop audio/video files here or browse
        </p>
        <p className="text-xs sm:text-sm mb-5 text-fg-tertiary">
          Supports MP3, WAV, M4A, MP4, WebM, AAC — up to 500MB
        </p>

        {/* Format pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {['MP3', 'WAV', 'M4A', 'MP4', 'WebM', 'AAC'].map((fmt) => (
            <span
              key={fmt}
              className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-surface-2 text-fg-tertiary border border-border"
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
