import { useRef, useState, useEffect, memo } from "react"
import { TranscriptEntry } from "../../types"
import { useToast } from "../ui/ToastContext"
import { useLanguage } from "../../context/LanguageContext"
import {
  MagnifyingGlass,
  X,
  Copy,
  Check,
  Quotes,
  Clock,
} from "@phosphor-icons/react"

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  currentTime: number
  onSeekTo: (seconds: number) => void
}

/** Escapes user input before building a RegExp (typing "(" used to crash). */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

interface RowProps {
  entry: TranscriptEntry
  isActive: boolean
  searchQuery: string
  copyLabel: string
  onSeekTo: () => void
  onCopy: () => void
  copied: boolean
}

/**
 * Memoized transcript row. Playback ticks previously re-created JSX for EVERY
 * segment (~1500 nodes/hour of audio); now only rows whose active state flips
 * re-render.
 */
const TranscriptRow = memo(function TranscriptRow({
  entry,
  isActive,
  searchQuery,
  copyLabel,
  onSeekTo,
  onCopy,
  copied,
}: RowProps) {
  const highlightParts = searchQuery.trim()
    ? entry.text.split(new RegExp(`(${escapeRegExp(searchQuery)})`, "gi"))
    : null

  return (
    <button
      type="button"
      onClick={onSeekTo}
      data-active={isActive ? "true" : "false"}
      className={`w-full text-left p-3.5 rounded-lg transition-colors duration-150 border cursor-pointer group relative overflow-hidden ${
        isActive
          ? "bg-primary-dim border-primary/40"
          : "border-transparent bg-surface-2/50 hover:bg-surface-2 hover:border-border"
      }`}
    >
      {/* Active Indicator Bar on Left */}
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Timestamp chip */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold flex-shrink-0 transition-colors ${
              isActive
                ? "bg-primary text-primary-contrast"
                : "bg-surface-3 text-fg-secondary border border-border group-hover:border-primary/30"
            }`}
          >
            <Clock size={11} weight="duotone" />
            <span>{entry.ts}</span>
          </span>

          {/* Spoken Text */}
          <p
            className={`text-xs sm:text-sm leading-relaxed transition-colors flex-1 ${
              isActive ? "text-fg font-medium" : "text-fg-secondary group-hover:text-fg"
            }`}
          >
            {highlightParts
              ? highlightParts.map((part, i) =>
                  part.toLowerCase() === searchQuery.toLowerCase() ? (
                    <mark
                      key={i}
                      className="bg-primary/30 text-primary-hover font-semibold rounded px-1 py-0.5 border border-primary/40"
                    >
                      {part}
                    </mark>
                  ) : (
                    part
                  ),
                )
              : entry.text}
          </p>
        </div>

        {/* Right Action: Copy sentence button & Live Soundwave badge */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
          {isActive && (
            <div className="flex items-center gap-0.5 h-3 px-1 text-primary">
              <span className="w-0.5 h-full bg-primary animate-pulse" />
              <span className="w-0.5 h-2 bg-primary/70 animate-pulse [animation-delay:75ms]" />
              <span className="w-0.5 h-full bg-primary animate-pulse [animation-delay:150ms]" />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCopy()
            }}
            className="p-2 rounded-lg text-fg-tertiary hover:text-fg hover:bg-surface-3 transition-colors"
            title={copyLabel}
            aria-label={copyLabel}
          >
            {copied ? (
              <Check size={14} className="text-success" weight="bold" />
            ) : (
              <Copy size={14} weight="duotone" />
            )}
          </button>
        </div>
      </div>
    </button>
  )
})

export default function TranscriptPanel({
  entries,
  currentTime,
  onSeekTo,
}: TranscriptPanelProps) {
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const { showToast } = useToast()

  // Filter entries based on search
  const filteredEntries = searchQuery.trim()
    ? entries.filter((entry) =>
        entry.text.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : entries

  // Find active entry based on current player timestamp (only in unfiltered view)
  let activeEntryIndex = -1
  if (!searchQuery && filteredEntries.length > 0) {
    // Binary search over sorted seconds â€” cheaper than findIndex scans on
    // every playback tick.
    let lo = 0
    let hi = filteredEntries.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (filteredEntries[mid].seconds <= currentTime) lo = mid + 1
      else hi = mid - 1
    }
    activeEntryIndex = hi
  }

  // Auto-scroll to the active entry without hijacking ancestor page scroll.
  useEffect(() => {
    const container = containerRef.current
    if (activeEntryIndex < 0 || !container || searchQuery) return

    const activeEl = container.querySelector<HTMLElement>('[data-active="true"]')
    if (!activeEl) return

    const cRect = container.getBoundingClientRect()
    const eRect = activeEl.getBoundingClientRect()
    const margin = cRect.height * 0.25
    // Only scroll when the active line drifts near the edges.
    if (eRect.top >= cRect.top + margin && eRect.bottom <= cRect.bottom - margin) return

    const delta =
      eRect.top - cRect.top - container.clientHeight / 2 + activeEl.offsetHeight / 2
    container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" })
  }, [activeEntryIndex, searchQuery])

  const handleCopySentence = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    showToast(t("btn_copy_sentence"), "success")
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col bg-surface relative"
      ref={containerRef}
    >
      {/* Sticky Header: Search Bar & Match Counter */}
      <div className="p-3.5 sm:p-4 sticky top-0 border-b border-border bg-surface z-20 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Quotes size={15} weight="duotone" className="text-fg-tertiary" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-fg-secondary">
              {t("transcript_title")}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-surface-3 text-fg-tertiary border border-border">
              {entries.length}
            </span>
          </div>

          <span className="text-[10px] font-mono text-fg-tertiary hidden sm:inline">
            {t("jump_hint")}
          </span>
        </div>

        {/* Search Engine Input */}
        <div className="relative group">
          <MagnifyingGlass
            size={15}
            className="text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-fg transition-colors"
          />
          <label htmlFor="transcript-search" className="sr-only">{t("search_transcript")}</label>
          <input
            id="transcript-search"
            type="text"
            placeholder={t("search_transcript")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-16 py-2 rounded-xl text-xs bg-surface-2 border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary/50 transition-all font-sans"
          />
          {searchQuery && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-fg-secondary">
                {filteredEntries.length}
              </span>
              <button
                onClick={() => setSearchQuery("")}
                className="p-1.5 rounded-lg text-fg-tertiary hover:bg-surface-3 hover:text-fg transition-colors"
                title={t("btn_cancel")}
                aria-label={t("btn_cancel")}
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Stream Cards */}
      <div className="p-3 sm:p-4 space-y-2">
        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs font-mono text-fg-tertiary">
              {t("no_transcript_matches")} "{searchQuery}"
            </p>
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <TranscriptRow
              key={`${entry.ts}-${index}`}
              entry={entry}
              isActive={index === activeEntryIndex && !searchQuery}
              searchQuery={searchQuery}
              copyLabel={t("btn_copy_sentence")}
              onSeekTo={() => onSeekTo(entry.seconds)}
              onCopy={() => handleCopySentence(entry.text, index)}
              copied={copiedIndex === index}
            />
          ))
        )}
      </div>
    </div>
  )
}
