import { useState, useEffect } from "react"
import { useLanguage } from "../../context/LanguageContext"
import { isNativeMobile } from "../../services/nativeRecorder"
import { AndroidLogo, DownloadSimple, X } from "@phosphor-icons/react"

const DISMISS_KEY = "audin_dismiss_apk_banner_v2"
const LATEST_RELEASE_URL =
  "https://github.com/galihpraditya/Audins/releases/latest"

export default function MobileDownloadBanner() {
  const { t } = useLanguage()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Never show if already running inside the native mobile APK
    if (isNativeMobile()) return

    // Only show if user is browsing from a mobile device (Android/iOS/tablet)
    const isMobileBrowser =
      typeof navigator !== "undefined" &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent || "",
      )

    if (!isMobileBrowser) return

    // Check if user previously dismissed this version's banner
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (!dismissed) {
        setIsVisible(true)
      }
    } catch {
      setIsVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, "true")
    } catch {
      /* non-fatal */
    }
  }

  if (!isVisible) return null

  return (
    <aside
      aria-label="Unduh Aplikasi Android Audin"
      className="w-full bg-gradient-to-r from-primary/15 via-surface-2 to-surface border-b border-primary/25 px-4 py-2.5 sm:py-3 animate-fade-in relative z-30"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-contrast flex items-center justify-center flex-shrink-0 shadow-xs">
            <AndroidLogo size={18} weight="fill" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-fg font-display tracking-tight">
                {t("mobile_app_banner_title")}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                APK
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-fg-secondary truncate">
              {t("mobile_app_banner_desc")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={LATEST_RELEASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-hover active:scale-95 text-primary-contrast shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <DownloadSimple size={14} weight="bold" />
            <span>{t("mobile_app_btn_download")}</span>
          </a>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t("mobile_app_btn_dismiss")}
            title={t("mobile_app_btn_dismiss")}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  )
}
