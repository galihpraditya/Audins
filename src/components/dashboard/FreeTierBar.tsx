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
    <div className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-border flex flex-col gap-3 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-xl pointer-events-none" />
      
      {/* Upload Limit */}
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-fg-secondary">
            Daily AI Uploads
          </span>
          <span className="text-xs text-primary font-mono">
            {uploadCount} / {maxUploads}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-background border border-border-subtle">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${percentage}%`,
              background: "linear-gradient(90deg, #6366f1, #7c3aed)",
            }}
          />
        </div>
        <p className="text-[10px] mt-1.5 text-fg-tertiary">
          {remaining} upload{remaining === 1 ? "" : "s"} remaining today
        </p>
      </div>

      {/* Storage Limit */}
      <div className="relative z-10 group/storage">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-fg-secondary">
            Storage (Audio)
          </span>
          <span className="text-xs text-pink-400 font-mono">
            {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-background border border-border-subtle">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${storagePercentage}%`,
              background: "linear-gradient(90deg, #ec4899, #be185d)",
            }}
          />
        </div>
        <p className="text-[10px] mt-1.5 text-fg-tertiary">
          Audio files are auto-deleted after 7 days
        </p>
      </div>
      
      {/* Upgrade Button */}
      <button
        onClick={onUpgrade}
        className="relative z-10 w-full mt-1 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary-hover hover:bg-primary/20 transition-colors"
      >
        Upgrade or enter API Key
      </button>
    </div>
  )
}
