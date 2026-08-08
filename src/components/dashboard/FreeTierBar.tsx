interface FreeTierBarProps {
  onUpgrade: () => void
  uploadCount?: number
  maxUploads?: number
  storageUsed?: number
  storageLimit?: number
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 MB"
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return "< 1 MB"
  return `${Math.round(mb)} MB`
}

export default function FreeTierBar({
  onUpgrade,
  uploadCount = 0,
  maxUploads = 5,
  storageUsed = 0,
  storageLimit = 500 * 1024 * 1024,
}: FreeTierBarProps) {
  const percentage = Math.round((uploadCount / maxUploads) * 100)
  const remaining = Math.max(0, maxUploads - uploadCount)

  const storagePercentage = Math.min(100, Math.round((storageUsed / storageLimit) * 100))


  return (
    <button
      onClick={onUpgrade}
      className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 bg-primary-dim border border-indigo-500/20 hover:bg-indigo-500/20 group"
    >
      {/* Upload Limit */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-fg-secondary group-hover:text-fg">
            Daily AI Uploads
          </span>
          <span className="text-xs text-primary-hover font-mono">
            {uploadCount} / {maxUploads}
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden bg-indigo-950">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${percentage}%`,
              background: "linear-gradient(90deg, #6366f1, #7c3aed)",
            }}
          />
        </div>
        <p className="text-xs mt-1.5 text-fg-tertiary">
          {remaining} upload{remaining === 1 ? "" : "s"} remaining today
        </p>
      </div>

      {/* Storage Limit */}
      <div className="relative group/storage">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-fg-secondary group-hover:text-fg">
            Storage (Audio)
          </span>
          <span className="text-xs text-pink-400 font-mono">
            {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden bg-indigo-950">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${storagePercentage}%`,
              background: "linear-gradient(90deg, #ec4899, #be185d)",
            }}
          />
        </div>
        <p className="text-xs mt-1.5 text-fg-tertiary">
          Audio files are auto-deleted after 7 days
        </p>
      </div>
    </button>
  )
}
