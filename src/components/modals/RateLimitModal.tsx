import { useState } from "react"

interface RateLimitModalProps {
  onClose: () => void
  onSaveApiKey?: (key: string) => void
  resetTime?: string
}

export default function RateLimitModal({
  onClose,
  onSaveApiKey,
  resetTime,
}: RateLimitModalProps) {
  const [apiKey, setApiKey] = useState("")

  let resetText = "Tomorrow"
  if (resetTime) {
    const resetDate = new Date(resetTime)
    const now = new Date()
    const diffMs = resetDate.getTime() - now.getTime()
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      resetText = `${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`
    } else {
      resetText = "Soon"
    }
  }

  const handleSubmit = () => {
    if (apiKey.trim()) {
      onSaveApiKey?.(apiKey.trim())
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden bg-surface border border-border shadow-2xl animate-scale-in">
        <div className="h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-purple-500" />
        <div className="p-6 sm:p-7">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 bg-primary-dim border border-indigo-500/20">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 text-primary-hover"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <h2
            id="modal-title"
            className="text-lg font-semibold mb-2 font-display text-fg tracking-tight"
          >
            Free Tier Limit Reached
          </h2>
          <p className="text-sm leading-relaxed mb-5 text-fg-secondary">
            You've reached the free processing limit for today. Wait until
            tomorrow, or enter your own Groq API Key to continue immediately.
          </p>

          <div className="mb-2">
            <label className="block text-xs font-mono font-medium mb-2 text-fg-tertiary">
              GROQ API KEY
            </label>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API Key (e.g., gsk_...)"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono bg-surface-2 border border-border text-fg outline-none focus:border-indigo-500 transition-all duration-150"
              />
              {apiKey.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </div>
          </div>

          <p className="text-xs mb-5 text-fg-tertiary flex items-center gap-1.5">
            <svg
              viewBox="0 0 12 12"
              fill="currentColor"
              className="w-3 h-3 opacity-60"
            >
              <path
                fillRule="evenodd"
                d="M8.5 1.5a2.5 2.5 0 00-5 0V3H2a1 1 0 00-1 1v6a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1H8.5V1.5zM7 1.5V3H5V1.5a1 1 0 012 0z"
                clipRule="evenodd"
              />
            </svg>
            Your key is only used locally and never stored on our servers.
          </p>

          <div className="flex items-center gap-3 mb-5 px-3 py-2.5 rounded-xl bg-surface-2 border border-border">
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-3.5 h-3.5 flex-shrink-0 text-fg-tertiary"
            >
              <circle cx="7" cy="7" r="5.5" />
              <path strokeLinecap="round" d="M7 4v3.25l2 1.5" />
            </svg>
            <p className="text-xs font-mono text-fg-tertiary">
              Resets in <span className="text-fg-secondary">{resetText}</span>
              {resetText !== "Soon" && " · Midnight UTC"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-fg-secondary hover:border-muted hover:text-fg transition-all duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                apiKey.length > 0
                  ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md"
                  : "bg-primary-dim text-primary-hover border border-indigo-500/25 hover:bg-indigo-500/20"
              }`}
            >
              Continue with Key
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
