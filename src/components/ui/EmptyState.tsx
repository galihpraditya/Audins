import { ReactNode } from "react"
import { FileAudio } from "@phosphor-icons/react"

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

/** Shared empty-state block (no documents / no search matches). */
export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl p-12 text-center border border-border bg-surface">
      <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 text-fg-tertiary">
        <FileAudio size={24} weight="duotone" />
      </div>
      <h3 className="text-sm font-semibold text-fg mb-1">{title}</h3>
      <p className="text-xs text-fg-tertiary max-w-sm mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function EmptyStateSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl p-12 text-center border border-border bg-surface animate-pulse"
    >
      <div className="w-12 h-12 rounded-full bg-surface-2 mx-auto mb-4" />
      <div className="h-3.5 rounded bg-surface-2 w-40 mx-auto mb-2" />
      <div className="h-3 rounded bg-surface-2 w-64 mx-auto" />
    </div>
  )
}
