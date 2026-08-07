import { DocumentStatus } from '../../types'

interface StatusBadgeProps {
  status: DocumentStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'Completed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Completed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-ring" />
      Processing
    </span>
  )
}
