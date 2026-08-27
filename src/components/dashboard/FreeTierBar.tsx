import { Lightning, HardDrives, Key, Check, Warning, Spinner } from "@phosphor-icons/react"
import { useLanguage } from "../../context/LanguageContext"

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
  const { t } = useLanguage()

  const percentage = hasCustomKey
    ? 100
    : Math.round((uploadCount / maxUploads) * 100)
  const remaining = Math.max(0, maxUploads - uploadCount)

  const storagePercentage = Math.min(
    100,
    Math.round((storageUsed / storageLimit) * 100),
  )

  // Dynamic color for upload quota
  const uploadBarColor = percentage >= 100 ? "bg-danger" : percentage >= 70 ? "bg-warning" : "bg-info"
  // Dynamic color for storage quota
  const storageBarColor = storagePercentage >= 90 ? "bg-danger" : storagePercentage >= 70 ? "bg-warning" : "bg-cyan"

  return (
    <div className="w-full p-3.5 rounded-xl bg-surface-2/60 border border-border flex flex-col gap-3">
      {/* Daily Quota */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5 text-fg-secondary">
            <Lightning size={14} weight="duotone" className="text-warning" />
            <span className="font-medium">{t("daily_uploads")}</span>
          </div>
          <span className="font-mono font-semibold text-fg">
            {hasCustomKey ? t("unlimited") : `${uploadCount}/${maxUploads}`}
          </span>
        </div>

        {/* With an unlimited key a full bar would read "almost exhausted". */}
        {!hasCustomKey && (
          <div className="h-1.5 rounded-full overflow-hidden bg-surface-3">
            <div
              className={`h-full rounded-full transition-all duration-300 ${uploadBarColor}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}

        <div className="flex justify-between items-center text-[10px] text-fg-tertiary">
          <span>{hasCustomKey ? t("custom_api_key") : `${remaining} ${t("uploads_left")}`}</span>
          {hasCustomKey && (
            <div>
              {apiKeyStatus === "validating" && (
                <span className="inline-flex items-center gap-1 text-warning font-mono">
                  <Spinner size={10} className="animate-spin" />
                  {t("api_status_checking")}
                </span>
              )}
              {(apiKeyStatus === "valid" || apiKeyStatus === "idle") && (
                <span className="inline-flex items-center gap-1 text-success font-mono">
                  <Check size={10} weight="bold" />
                  {t("api_status_active")}
                </span>
              )}
              {apiKeyStatus === "invalid" && (
                <span className="inline-flex items-center gap-1 text-danger font-mono">
                  <Warning size={10} weight="fill" />
                  {t("api_status_invalid")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Storage */}
      <div className="space-y-1.5 pt-2.5 border-t border-border">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5 text-fg-secondary">
            <HardDrives size={14} weight="duotone" className="text-cyan" />
            <span className="font-medium">{t("storage")}</span>
          </div>
          <span className="font-mono font-semibold text-fg-secondary">
            {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
          </span>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden bg-surface-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${storageBarColor}`}
            style={{ width: `${storagePercentage}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] text-fg-tertiary">
          <span>{t("auto_purge_days")}</span>
          <span className="font-mono">{storagePercentage}%</span>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={onUpgrade}
        className="w-full mt-0.5 py-2 px-3 rounded-lg text-xs font-semibold bg-surface hover:bg-surface-2 text-fg border border-border hover:border-primary/40 transition-colors flex items-center justify-center gap-2 min-h-[36px]"
      >
        <Key size={14} weight="duotone" className="text-primary" />
        <span>{hasCustomKey ? t("settings_title") : t("btn_api_limits")}</span>
      </button>
    </div>
  )
}
