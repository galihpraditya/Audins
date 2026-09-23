import { DocumentStatus } from "../../types"

import { useLanguage } from "../../context/LanguageContext"

import {
  CheckCircle,
  CircleNotch,
  WarningCircle,
  CloudArrowUp,
} from "@phosphor-icons/react"

interface StatusBadgeProps {
  status: DocumentStatus

  uploadProgress?: number

  size?: "sm" | "md"
}

export default function StatusBadge({
  status,
  uploadProgress,
  size = "md",
}: StatusBadgeProps) {
  const { t } = useLanguage()

  const isSm = size === "sm"

  const paddingClass = isSm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"

  if (status === "Completed") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-mono font-semibold bg-success-dim text-success border border-success/25 flex-shrink-0 select-none ${paddingClass}`}
      >
        <CheckCircle
          size={isSm ? 12 : 14}
          weight="fill"
          className="flex-shrink-0 text-success"
        />
        <span>{t("filter_completed")}</span>
      </span>
    )
  }

  // Failed before progress — a stale uploadProgress must not mask failure

  if (status === "Failed") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-mono font-medium bg-danger-dim text-danger border border-danger/30 flex-shrink-0 select-none ${paddingClass}`}
      >
        <WarningCircle
          size={isSm ? 12 : 14}
          weight="fill"
          className="flex-shrink-0 text-danger"
        />
        <span>{t("filter_failed")}</span>
      </span>
    )
  }

  if (uploadProgress !== undefined && uploadProgress < 100) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-mono font-medium bg-info-dim text-info border border-info/30 flex-shrink-0 select-none ${paddingClass}`}
      >
        <CloudArrowUp
          size={isSm ? 12 : 14}
          weight="duotone"
          className="flex-shrink-0 text-info"
        />
        <span>{uploadProgress}%</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-medium bg-warning-dim text-warning border border-warning/30 flex-shrink-0 select-none ${paddingClass}`}
    >
      <CircleNotch
        size={isSm ? 12 : 14}
        weight="bold"
        className="animate-spin flex-shrink-0 text-warning"
      />
      <span>{t("filter_processing")}</span>
    </span>
  )
}
