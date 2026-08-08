interface FreeTierBarProps {
  onUpgrade: () => void
  uploadCount?: number
  maxUploads?: number
}

export default function FreeTierBar({
  onUpgrade,
  uploadCount = 0,
  maxUploads = 5,
}: FreeTierBarProps) {
  const percentage = Math.round((uploadCount / maxUploads) * 100)
  const remaining = Math.max(0, maxUploads - uploadCount)

  return (
    <button
      onClick={onUpgrade}
      className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 bg-primary-dim border border-indigo-500/20 hover:bg-indigo-500/20 group"
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-fg-secondary group-hover:text-fg">
          Free Tier
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
    </button>
  )
}
