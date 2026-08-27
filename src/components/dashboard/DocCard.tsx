import { ReactNode } from "react"
import { DocumentItem } from "../../types"
import StatusBadge from "./StatusBadge"
import { FileAudio, Clock, CalendarBlank } from "@phosphor-icons/react"

interface DocCardProps {
  doc: DocumentItem
  openLabel: string
  onOpen: () => void
  /** Optional top-right node (e.g. a kebab menu) — stops propagation itself. */
  actions?: ReactNode
}

/**
 * Shared document card used by the Dashboard grid and the Workspace library.
 * Flat editorial surface: hairline border, muted glyph, hover ring + arrow.
 */
export default function DocCard({ doc, openLabel, onOpen, actions }: DocCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${openLabel} ${doc.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className="glass-card glass-card-hover rounded-xl p-5 cursor-pointer flex flex-col justify-between group relative focus-visible:outline-primary"
    >
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-fg-tertiary flex-shrink-0 transition-colors group-hover:text-primary group-hover:bg-surface-3">
              <FileAudio size={18} weight="duotone" />
            </div>
            <StatusBadge status={doc.status} uploadProgress={doc.uploadProgress} size="sm" />
          </div>
          {actions}
        </div>

        <h3 className="text-sm font-bold font-display text-fg group-hover:text-primary transition-colors line-clamp-2 leading-snug">
          {doc.name}
        </h3>
      </div>

      <div className="pt-3 border-t border-border mt-4 flex items-center justify-between text-[11px] font-mono text-fg-tertiary">
        <div className="flex items-center gap-1.5">
          <Clock size={13} weight="duotone" />
          <span>{doc.duration}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarBlank size={13} weight="duotone" />
          <span>{doc.date}</span>
        </div>
        <span
          aria-hidden="true"
          className="text-primary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
        >
          →
        </span>
      </div>
    </div>
  )
}

/** Pulse placeholder matching DocCard dimensions for initial loads. */
export function DocCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-border bg-surface p-5 animate-pulse"
    >
      <div className="flex items-center justify-between mb-3.5">
        <div className="w-9 h-9 rounded-lg bg-surface-2" />
        <div className="w-16 h-4 rounded-full bg-surface-2" />
      </div>
      <div className="h-3.5 rounded bg-surface-2 w-4/5 mb-2" />
      <div className="h-3.5 rounded bg-surface-2 w-2/5 mb-6" />
      <div className="pt-3 border-t border-border flex justify-between">
        <div className="h-3 w-14 rounded bg-surface-2" />
        <div className="h-3 w-16 rounded bg-surface-2" />
      </div>
    </div>
  )
}
