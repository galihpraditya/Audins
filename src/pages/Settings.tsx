import { useState } from "react"
import { useLanguage } from "../context/LanguageContext"
import { useTheme } from "../context/ThemeContext"
import { useToast } from "../components/ui/ToastContext"
import { Key, LockKey, Translate, Sun, Moon, CheckCircle } from "@phosphor-icons/react"

interface SettingsPageProps {
  currentApiKey: string
  onSaveApiKey: (key: string) => void
}

export default function SettingsPage({ currentApiKey, onSaveApiKey }: SettingsPageProps) {
  const { t, language, setLanguage } = useLanguage()
  const { theme, setTheme } = useTheme()
  const { showToast } = useToast()

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
              <LockKey size={13} weight="duotone" className="text-fg-tertiary" />
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
            <div className="flex items-center p-1 rounded-lg bg-surface-2" role="group" aria-label={t("settings_language_label")}>
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
            <div className="flex items-center p-1 rounded-lg bg-surface-2" role="group" aria-label={t("settings_theme_label")}>
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
