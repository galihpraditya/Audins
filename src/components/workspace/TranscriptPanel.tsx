import { useRef, useState, useEffect } from "react"
import { TranscriptEntry } from "../../types"

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  currentTime: number
  onSeekTo: (seconds: number) => void
}

export default function TranscriptPanel({
  entries,
  currentTime,
  onSeekTo,
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Filter entries based on search
  const filteredEntries = entries.filter((entry) =>
    entry.text.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Find active entry based on current player timestamp (only in filtered view)
  const activeEntryIndex = filteredEntries.findIndex((entry, i) => {
    const nextEntry = filteredEntries[i + 1]
    if (nextEntry) {
      return currentTime >= entry.seconds && currentTime < nextEntry.seconds
    }
    return currentTime >= entry.seconds
  })

  // Auto-scroll to active entry
  useEffect(() => {
    if (activeEntryIndex >= 0 && containerRef.current && !searchQuery) {
      const activeEl = containerRef.current.querySelector(
        '[data-active="true"]',
      )
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [activeEntryIndex, searchQuery])

  // Highlight search text helper
  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text
    const parts = text.split(new RegExp(`(${highlight})`, "gi"))
    return parts.map((part, i) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <span
          key={i}
          className="bg-yellow-500/30 text-yellow-200 rounded px-0.5"
        >
          {part}
        </span>
      ) : (
        part
      ),
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto flex flex-col bg-surface"
      ref={containerRef}
    >
      <div className="px-4 py-3 sticky top-0 border-b border-border bg-surface z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <p className="text-xs font-mono font-medium uppercase tracking-widest text-fg-tertiary">
              Raw Transcript ({entries.length})
            </p>
          </div>
          <span className="text-xs font-mono text-fg-tertiary">
            Click to seek
          </span>
        </div>

        {/* Search Input */}
        <div className="relative group">
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs font-sans bg-surface-2 border border-border text-fg outline-none focus:border-indigo-500 transition-colors placeholder:text-fg-tertiary"
          />
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-3.5 h-3.5 text-fg-tertiary absolute left-2.5 top-1/2 -translate-y-1/2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 19l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-fg-tertiary hover:bg-surface-2 hover:text-fg transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-3 h-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 14l8-8m-8 0l8 8"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-1">
        {filteredEntries.length === 0 ? (
          <p className="text-xs text-center text-fg-tertiary mt-4">
            No results found for "{searchQuery}"
          </p>
        ) : (
          filteredEntries.map((entry, index) => {
            const isActive =
              index === (activeEntryIndex >= 0 ? activeEntryIndex : 0) &&
              !searchQuery
            return (
              <button
                key={entry.ts + index}
                onClick={() => onSeekTo(entry.seconds)}
                data-active={isActive ? "true" : "false"}
                className={`w-full text-left p-3 rounded-xl transition-all duration-150 border ${
                  isActive
                    ? "bg-primary-dim border-indigo-500/30 text-fg"
                    : "border-transparent text-fg-secondary hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-xs pt-0.5 flex-shrink-0 font-mono font-semibold text-primary">
                    {entry.ts}
                  </span>
                  <p className="text-xs leading-relaxed">
                    {highlightText(entry.text, searchQuery)}
                  </p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
