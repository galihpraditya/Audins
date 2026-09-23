import { useState, useRef, useEffect } from "react"

import { Link } from "react-router-dom"

import { useAuth } from "../../context/AuthContext"

import { useLanguage } from "../../context/LanguageContext"

import { useToast } from "../ui/ToastContext"

import {
  UserCircle,
  SignOut,
  SignIn,
  ArrowsClockwise,
  GearSix,
  CheckCircle,
  WarningCircle,
  CaretDown,
} from "@phosphor-icons/react"

interface UserDropdownProps {
  compact?: boolean
}

export default function UserDropdown({ compact = false }: UserDropdownProps) {
  const {
    user,

    isAuthenticated,

    isGuest,

    syncStatus,

    openAuthModal,

    logout,

    triggerSync,
  } = useAuth()

  const { t } = useLanguage()

  const { showToast } = useToast()

  const [isOpen, setIsOpen] = useState(false)

  const [isSyncing, setIsSyncing] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const handleSyncClick = async () => {
    setIsSyncing(true)

    try {
      await triggerSync()

      showToast(t("sync_now_toast"), "success")
    } catch {
      showToast(t("error_load_title"), "error")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLogout = () => {
    setIsOpen(false)

    logout()

    showToast(t("auth_sign_out"), "info")
  }

  // GUEST STATE

  if (isGuest || !user) {
    return (
      <button
        onClick={() => openAuthModal("login")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface border border-border hover:border-primary/40 text-fg transition-all cursor-pointer shadow-sm group min-h-[34px]"
        title={t("auth_guest_desc")}
      >
        <SignIn
          size={15}
          weight="duotone"
          className="text-primary group-hover:scale-110 transition-transform"
        />
        <span className={compact ? "hidden sm:inline" : ""}>
          {t("auth_sign_in")}
        </span>
      </button>
    )
  }

  // AUTHENTICATED STATE

  const userInitial = (user.name || user.email || "U")[0].toUpperCase()

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-surface-2 hover:bg-surface border border-border hover:border-primary/40 transition-all cursor-pointer text-left min-h-[34px]"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="relative flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-contrast flex items-center justify-center font-bold text-[11px] select-none">
            {userInitial}
          </div>
          {/* Sync indicator dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface ${
              syncStatus === "synced"
                ? "bg-success"
                : syncStatus === "syncing"
                  ? "bg-warning animate-pulse"
                  : "bg-fg-tertiary"
            }`}
            title={
              syncStatus === "synced"
                ? t("sync_status_synced")
                : syncStatus === "syncing"
                  ? t("sync_status_syncing")
                  : t("sync_status_offline")
            }
          />
        </div>

        {!compact && (
          <div className="hidden sm:flex flex-col min-w-0 max-w-[120px]">
            <span className="text-[11px] font-semibold text-fg truncate leading-tight">
              {user.name || user.email.split("@")[0]}
            </span>
            <span className="text-[9px] font-mono text-fg-tertiary truncate leading-tight">
              {syncStatus === "synced"
                ? t("sync_status_synced")
                : syncStatus === "syncing"
                  ? t("sync_status_syncing")
                  : t("sync_status_offline")}
            </span>
          </div>
        )}

        <CaretDown
          size={12}
          weight="bold"
          className={`text-fg-tertiary transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-surface border border-border shadow-raised py-2 z-50 animate-scale-in text-xs space-y-1">
          {/* User Details */}
          <div className="px-3.5 py-2.5 border-b border-border">
            <p className="font-semibold text-fg truncate">
              {user.name || user.email.split("@")[0]}
            </p>
            <p className="text-[11px] text-fg-tertiary truncate font-mono mt-0.5">
              {user.email}
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-fg-secondary">
              {syncStatus === "synced" ? (
                <>
                  <CheckCircle
                    size={13}
                    weight="fill"
                    className="text-success flex-shrink-0"
                  />
                  <span>{t("sync_status_synced")}</span>
                </>
              ) : syncStatus === "syncing" ? (
                <>
                  <ArrowsClockwise
                    size={13}
                    weight="bold"
                    className="text-warning animate-spin flex-shrink-0"
                  />
                  <span>{t("sync_status_syncing")}</span>
                </>
              ) : (
                <>
                  <WarningCircle
                    size={13}
                    weight="fill"
                    className="text-warning flex-shrink-0"
                  />
                  <span>{t("sync_status_offline")}</span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-1 space-y-0.5">
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer text-left"
            >
              <ArrowsClockwise
                size={15}
                weight="duotone"
                className={`text-primary ${isSyncing ? "animate-spin" : ""}`}
              />
              <span>{t("sync_btn_now")}</span>
            </button>

            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors text-left"
            >
              <GearSix
                size={15}
                weight="duotone"
                className="text-fg-tertiary"
              />
              <span>{t("nav_settings")}</span>
            </Link>

            <div className="h-px bg-border my-1" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-danger hover:bg-danger-dim transition-colors cursor-pointer text-left font-medium"
            >
              <SignOut size={15} weight="duotone" />
              <span>{t("auth_sign_out")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
