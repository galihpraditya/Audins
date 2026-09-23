import { ReactNode } from "react"

import {
  WarningCircle,
  WarningOctagon,
  Info,
  CheckCircle,
} from "@phosphor-icons/react"

type AlertVariant = "danger" | "warning" | "info" | "success"

interface AlertProps {
  variant?: AlertVariant

  /** Bold lead-in line. Body copy goes in children. */

  title?: string

  children?: ReactNode

  /** Rendered on the right side (e.g. a Retry button). */

  action?: ReactNode
}

/* True monochrome: rails differentiate via weight, not hue. Danger = solid
   ink, warning = mid, info/success = faint — icons carry the semantics. */

const RAIL: Record<AlertVariant, string> = {
  danger: "bg-fg",

  warning: "bg-fg/60",

  info: "bg-fg/25",

  success: "bg-fg",
}

const ICON: Record<AlertVariant, ReactNode> = {
  danger: <WarningOctagon size={17} weight="fill" className="text-fg" />,

  warning: <WarningCircle size={17} weight="duotone" className="text-fg" />,

  info: <Info size={17} weight="duotone" className="text-fg-secondary" />,

  success: <CheckCircle size={17} weight="fill" className="text-fg" />,
}

/**
 * Inline alert banner — flat surface, hairline border, ink left rail.
 * Variants differ by rail weight + icon, not hue.
 */

export default function Alert({
  variant = "info",

  title,

  children,

  action,
}: AlertProps) {
  return (
    <div
      role="alert"
      className="relative flex items-start gap-3 px-4 py-3 pl-5 rounded-xl border border-border bg-surface overflow-hidden"
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${RAIL[variant]}`}
      />
      <span className="flex-shrink-0 mt-0.5">{ICON[variant]}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-xs font-semibold text-fg">{title}</p>}
        {children && (
          <div
            className={`text-[11px] text-fg-secondary leading-relaxed ${
              title ? "mt-0.5" : ""
            }`}
          >
            {children}
          </div>
        )}
      </div>
      {action && <div className="flex-shrink-0 self-center">{action}</div>}
    </div>
  )
}
