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
  maxUploads = 10,
  storageUsed = 0,
  storageLimit = 500 * 1024 * 1024,
  hasCustomKey = false,
  apiKeyStatus = "idle",
}: FreeTierBarProps) {
  const percentage = hasCustomKey
    ? 100
    : Math.round((uploadCount / maxUploads) * 100)
  const remaining = Math.max(0, maxUploads - uploadCount)

  const storagePercentage = Math.min(
    100,
    Math.round((storageUsed / storageLimit) * 100),
  )

  return (
    <div className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-border flex flex-col gap-3 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-xl pointer-events-none" />

      {/* Uploads Section */}
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-1.5 gap-2">
          <span className="text-xs font-medium text-fg-secondary shrink-0 whitespace-nowrap">
            Daily Uploads
          </span>
          <span className="text-xs text-primary font-mono font-semibold shrink-0 whitespace-nowrap">
            {hasCustomKey ? "Unlimited" : `${uploadCount} / ${maxUploads}`}
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

        <div className="flex justify-between items-center mt-1.5 gap-1 min-h-[18px]">
          <p className="text-[10px] text-fg-tertiary truncate">
            {hasCustomKey
              ? "Custom API Key"
              : `${remaining} upload${remaining === 1 ? "" : "s"} remaining today`}
          </p>

          {hasCustomKey && (
            <div className="shrink-0">
              {apiKeyStatus === "validating" && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium whitespace-nowrap">
                  <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  Validating
                </span>
              )}
              {(apiKeyStatus === "valid" || apiKeyStatus === "idle") && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Active
                </span>
              )}
              {apiKeyStatus === "invalid" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-medium whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Invalid
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Storage Limit Section */}
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-1.5 gap-2">
          <span className="text-xs font-medium text-fg-secondary shrink-0 whitespace-nowrap">
            Storage
          </span>
          <span className="text-xs text-pink-400 font-mono shrink-0 whitespace-nowrap text-right">
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
          Auto-deleted after 7 days
        </p>
      </div>

      {/* Upgrade / Manage Button */}
      <button
        onClick={onUpgrade}
        className="relative z-10 w-full mt-0.5 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary-hover hover:bg-primary/20 transition-colors"
      >
        {hasCustomKey ? "Manage API Key" : "Upgrade or enter API Key"}
      </button>
    </div>
  )
}
