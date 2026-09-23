import { useState } from "react"

import { useLanguage } from "../context/LanguageContext"

import { useTheme } from "../context/ThemeContext"

import { useToast } from "../components/ui/ToastContext"

import { useAuth } from "../context/AuthContext"

import {
  Key,
  LockKey,
  Translate,
  Sun,
  Moon,
  CheckCircle,
  UserCircle,
  SignOut,
  ArrowsClockwise,
  CloudArrowUp,
  WarningCircle,
} from "@phosphor-icons/react"

interface SettingsPageProps {
  currentApiKey: string

  onSaveApiKey: (key: string) => void
}

export default function SettingsPage({
  currentApiKey,
  onSaveApiKey,
}: SettingsPageProps) {
  const { t, language, setLanguage } = useLanguage()

  const { theme, setTheme } = useTheme()

  const { showToast } = useToast()

  const {
    user,

    isAuthenticated,

    syncStatus,

    openAuthModal,

    logout,

    triggerSync,
  } = useAuth()

  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey)

  const [saveMessage, setSaveMessage] = useState("")

  const handleSave = () => {
    onSaveApiKey(apiKeyInput.trim())

    const msg = t("settings_saved")

    setSaveMessage(msg)

    showToast(msg, "success")

    setTimeout(() => setSaveMessage(""), 2500)
  }

  const hasChanged = apiKeyInput.trim() !== currentApiKey.trim()

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
        {/* Page header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-fg">
            {t("settings_title")}
          </h1>
          <p className="text-xs sm:text-sm text-fg-secondary mt-1.5">
            {t("settings_desc")}
          </p>
        </div>

        {/* Account & Device Sync section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold font-display text-fg">
              {t("sync_title")}
            </h2>
            <p className="text-xs text-fg-tertiary mt-1">{t("sync_desc")}</p>
          </div>

          {isAuthenticated && user ? (
            <div className="p-4 rounded-xl bg-surface border border-border space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-contrast flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg truncate">
                      {user.name || user.email.split("@")[0]}
                    </p>
                    <p className="text-xs text-fg-tertiary truncate font-mono">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      syncStatus === "synced"
                        ? "bg-success-dim border-success/30 text-success"
                        : syncStatus === "syncing"
                          ? "bg-warning-dim border-warning/30 text-warning"
                          : "bg-surface-2 border-border text-fg-secondary"
                    }`}
                  >
                    {syncStatus === "synced" ? (
                      <CheckCircle size={14} weight="fill" />
                    ) : syncStatus === "syncing" ? (
                      <ArrowsClockwise
                        size={14}
                        weight="bold"
                        className="animate-spin"
                      />
                    ) : (
                      <WarningCircle size={14} weight="fill" />
                    )}
                    <span>
                      {syncStatus === "synced"
                        ? t("sync_status_synced")
                        : syncStatus === "syncing"
                          ? t("sync_status_syncing")
                          : t("sync_status_offline")}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={async () => {
                    await triggerSync()

                    showToast(t("sync_now_toast"), "success")
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-fg border border-border transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <ArrowsClockwise size={14} weight="duotone" />
                  {t("sync_btn_now")}
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-danger hover:bg-danger-dim transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <SignOut size={14} weight="duotone" />
                  {t("auth_sign_out")}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center text-fg-tertiary flex-shrink-0">
                  <CloudArrowUp
                    size={20}
                    weight="duotone"
                    className="text-primary"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-fg">
                    {t("auth_guest")}
                  </p>
                  <p className="text-xs text-fg-secondary mt-0.5">
                    {t("sync_card_login_cta")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openAuthModal("login")}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-contrast hover:bg-primary-hover transition-colors inline-flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
              >
                <UserCircle size={15} weight="duotone" />
                {t("auth_sign_in")}
              </button>
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="h-px bg-border" aria-hidden="true" />

        {/* API Key section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold font-display text-fg">
              {t("tab_api_key")}
            </h2>
            <p className="text-xs text-fg-tertiary mt-1">
              {t("key_storage_hint")}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="settings-api-key"
              className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary"
            >
              {t("personal_api_key_label")}
            </label>
            <div className="relative">
              <input
                id="settings-api-key"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-4 py-3 rounded-xl text-xs font-mono bg-surface border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary transition-colors"
              />
              {apiKeyInput.length > 0 && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-fg-tertiary">
              <LockKey
                size={13}
                weight="duotone"
                className="text-fg-tertiary"
              />
              <span>{t("key_storage_hint")}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!hasChanged}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-contrast hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 min-h-[38px]"
            >
              <Key size={14} weight="duotone" />
              {t("btn_save_config")}
            </button>
            {saveMessage && (
              <span className="text-xs font-medium text-success inline-flex items-center gap-1.5">
                <CheckCircle size={14} weight="fill" />
                {saveMessage}
              </span>
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="h-px bg-border" aria-hidden="true" />

        {/* Appearance section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-bold font-display text-fg">
              {t("settings_appearance_title")}
            </h2>
            <p className="text-xs text-fg-tertiary mt-1">
              {t("settings_appearance_desc")}
            </p>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-fg-tertiary flex-shrink-0">
                <Translate size={16} weight="duotone" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {t("settings_language_label")}
                </p>
                <p className="text-xs text-fg-tertiary">
                  {language === "en" ? "English" : "Indonesia"}
                </p>
              </div>
            </div>
            <div
              className="flex items-center p-1 rounded-lg bg-surface-2"
              role="group"
              aria-label={t("settings_language_label")}
            >
              {(["en", "id"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  aria-pressed={language === lang}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    language === lang
                      ? "bg-surface text-fg shadow-card"
                      : "text-fg-tertiary hover:text-fg"
                  }`}
                >
                  {lang === "en" ? "EN" : "ID"}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-fg-tertiary flex-shrink-0">
                {theme === "dark" ? (
                  <Moon size={16} weight="duotone" />
                ) : (
                  <Sun size={16} weight="duotone" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {t("settings_theme_label")}
                </p>
                <p className="text-xs text-fg-tertiary">
                  {theme === "dark" ? t("theme_dark") : t("theme_light")}
                </p>
              </div>
            </div>
            <div
              className="flex items-center p-1 rounded-lg bg-surface-2"
              role="group"
              aria-label={t("settings_theme_label")}
            >
              {(["light", "dark"] as const).map((th) => (
                <button
                  key={th}
                  onClick={() => setTheme(th)}
                  aria-pressed={theme === th}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    theme === th
                      ? "bg-surface text-fg shadow-card"
                      : "text-fg-tertiary hover:text-fg"
                  }`}
                >
                  {th === "light" ? (
                    <Sun size={13} weight="duotone" />
                  ) : (
                    <Moon size={13} weight="duotone" />
                  )}
                  {th === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
