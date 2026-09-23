import { useState, useEffect } from "react"

import { useLanguage } from "../../context/LanguageContext"

import Modal from "../ui/Modal"

import {
  ShieldWarning,
  LockKey,
  Clock,
  X,
  ArrowRight,
} from "@phosphor-icons/react"

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
  const { t } = useLanguage()

  const [apiKey, setApiKey] = useState("")

  // Ticking "now" so the countdown actually updates (was frozen at render).

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)

    return () => clearInterval(timer)
  }, [])

  let resetText = t("quota_resets_tomorrow")

  if (resetTime) {
    const resetDate = new Date(resetTime)

    const diffMs = resetDate.getTime() - now

    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60))

      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

      resetText = `${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`
    } else {
      resetText = t("quota_resets_soon")
    }
  }

  const handleSubmit = () => {
    if (apiKey.trim()) {
      onSaveApiKey?.(apiKey.trim())
    }

    onClose()
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="modal-title"
      panelClassName="w-full max-w-md rounded-2xl bg-surface border border-border shadow-raised animate-scale-in"
    >
      <div className="p-6 sm:p-8 space-y-6">
        {/* Header row with Icon & Close */}
        <div className="flex items-start justify-between">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-warning-dim border border-warning/25 text-warning">
            <ShieldWarning size={28} weight="duotone" />
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors min-h-[36px]"
            aria-label={t("btn_close")}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div>
          <h2
            id="modal-title"
            className="text-base sm:text-lg font-bold font-display text-fg tracking-tight"
          >
            {t("limit_reached_title")}
          </h2>
          <p className="text-xs sm:text-sm text-fg-secondary mt-1.5 leading-relaxed">
            {t("limit_reached_desc")}
          </p>
        </div>

        {/* API Key Input Field */}
        <div className="space-y-2">
          <label
            htmlFor="ratelimit-api-key"
            className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary"
          >
            {t("personal_api_key_label")}
          </label>
          <div className="relative">
            <input
              id="ratelimit-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full px-4 py-3 rounded-xl text-xs font-mono bg-surface-2 border border-border text-fg outline-none focus:border-primary  transition-all"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            {apiKey.length > 0 && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-fg-tertiary pt-0.5">
            <LockKey size={13} weight="duotone" className="text-fg-tertiary" />
            <span>{t("key_storage_hint")}</span>
          </div>
        </div>

        {/* Reset Timer Pill â€” ticks every 30s */}
        <div
          className="flex items-center gap-2.5 p-3 rounded-2xl bg-surface-2/80 border border-border text-xs font-mono text-fg-tertiary"
          role="timer"
        >
          <Clock
            size={16}
            weight="duotone"
            className="text-fg-tertiary flex-shrink-0"
          />
          <p>
            {t("resets_in")}{" "}
            <span className="font-bold text-fg">{resetText}</span>
            {resetTime &&
              diffPositive(resetTime, now) &&
              ` ${t("midnight_utc")}`}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl text-xs font-medium text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border transition-all min-h-[40px]"
          >
            {t("btn_close")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim()}
            title={!apiKey.trim() ? t("personal_api_key_label") : undefined}
            className="flex-1 py-2.5 rounded-2xl text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover transition-all flex items-center justify-center gap-1.5 min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>{t("btn_continue")}</span>
            <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </div>
    </Modal>
  )
}

function diffPositive(resetTime: string, now: number): boolean {
  return new Date(resetTime).getTime() - now > 0
}
