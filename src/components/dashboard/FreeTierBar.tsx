import { useState } from "react"

interface FreeTierBarProps {
  onUpgrade: () => void
  uploadCount?: number
  maxUploads?: number
  storageUsed?: number
  storageLimit?: number
  hasCustomKey?: boolean
  apiKeyStatus?: "idle" | "validating" | "valid" | "invalid"
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
  hasCustomKey = false,
  apiKeyStatus = "idle",
}: FreeTierBarProps) {
  const percentage = hasCustomKey
    ? 0
    : Math.round((uploadCount / maxUploads) * 100)
  const remaining = Math.max(0, maxUploads - uploadCount)

  const storagePercentage = Math.min(
    100,
    Math.round((storageUsed / storageLimit) * 100),
  )

  return (
    <div className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-border flex flex-col gap-3 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-xl pointer-events-none" />

      {/* Upload Limit / Custom Key Status */}
      <div className="relative z-10">
        {hasCustomKey ? (
          <>
            <div className="flex justify-between items-start mb-1.5 gap-2">
              <span className="text-xs font-medium text-fg-secondary mt-0.5">
                AI Uploads
              </span>
              <div className="flex flex-col items-end gap-1">
                {apiKeyStatus === "validating" && (
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400">
                    <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Validating...
                  </span>
                )}
                {apiKeyStatus === "valid" && (
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-primary-hover">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                    Key Active
                  </span>
                )}
                {apiKeyStatus === "invalid" && (
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]" />
                    Invalid Key
                  </span>
                )}
                <span className="text-xs text-primary font-mono font-semibold">
                  Unlimited
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-background border border-border-subtle relative mt-1">
              <div
                className="absolute inset-0 w-full"
                style={{
                  background: "linear-gradient(90deg, #6366f1, #7c3aed)",
                  opacity: 0.85,
                }}
              />
            </div>
            <p className="text-[10px] mt-1.5 text-fg-tertiary">
              Custom API key is enabled
            </p>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Storage Limit */}
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-1.5 gap-2">
          <span className="text-xs font-medium text-fg-secondary shrink-0">
            Storage
          </span>
          <span className="text-xs text-pink-400 font-mono truncate text-right">
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

      {/* Upgrade / Manage Button */}
      <button
        onClick={onUpgrade}
        className="relative z-10 w-full mt-1 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary-hover hover:bg-primary/20 transition-colors"
      >
        {hasCustomKey ? "Manage API Key" : "Upgrade or enter API Key"}
      </button>
    </div>
  )
}
