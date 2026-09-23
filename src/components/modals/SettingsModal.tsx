import { useState } from "react"

import { useLanguage } from "../../context/LanguageContext"

import Modal from "../ui/Modal"

import {
  GearSix,
  Key,
  Cpu,
  LockKey,
  CheckCircle,
  X,
  Sparkle,
  Globe,
  HardDrives,
  Lightning,
} from "@phosphor-icons/react"

interface SettingsModalProps {
  onClose: () => void

  currentApiKey?: string

  onSaveApiKey: (key: string) => void

  uploadCount?: number

  maxUploads?: number
}

type TabType = "api" | "portfolio"

export default function SettingsModal({
  onClose,

  currentApiKey = "",

  onSaveApiKey,

  uploadCount = 0,

  maxUploads = 10,
}: SettingsModalProps) {
  const { t } = useLanguage()

  const [activeTab, setActiveTab] = useState<TabType>("api")

  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey)

  const [saveMessage, setSaveMessage] = useState("")

  const handleSave = () => {
    onSaveApiKey(apiKeyInput.trim())

    setSaveMessage(t("settings_saved"))

    setTimeout(() => setSaveMessage(""), 2500)
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="settings-modal-title"
      panelClassName="w-full max-w-xl rounded-2xl overflow-hidden bg-surface border border-border shadow-raised animate-scale-in flex flex-col max-h-[90vh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-surface/90">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary-dim text-primary">
            <GearSix size={22} weight="duotone" />
          </div>
          <div>
            <h2
              id="settings-modal-title"
              className="text-base sm:text-lg font-bold font-display text-fg tracking-tight"
            >
              {t("settings_title")}
            </h2>
            <p className="text-xs text-fg-tertiary">{t("settings_desc")}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors"
          aria-label="Close settings"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border bg-surface-2/60 px-6 gap-2 pt-2">
        {[
          {
            id: "api",
            label: t("tab_api_key"),
            icon: <Key size={14} weight="duotone" />,
          },

          {
            id: "portfolio",
            label: t("tab_about"),
            icon: <Cpu size={14} weight="duotone" />,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all border-b-2 ${
              activeTab === tab.id
                ? "border-primary text-primary-hover bg-primary-dim"
                : "border-transparent text-fg-tertiary hover:text-fg-secondary"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Body */}
      <div className="p-6 sm:p-7 space-y-5 flex-1 overflow-y-auto">
        {activeTab === "api" && (
          <div className="space-y-5">
            {/* Demo Mode Status Card */}
            <div className="p-4 rounded-xl bg-primary-dim border border-primary/20">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-fg-tertiary flex-shrink-0 mt-0.5">
                  <Sparkle size={18} weight="fill" />
                </div>
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-fg-secondary mb-1">
                    {t("demo_quota_active")}
                  </h4>
                  <p className="text-xs text-fg-secondary leading-relaxed">
                    {t("demo_quota_desc")} (
                    <span className="font-mono text-fg font-bold">
                      {Math.max(0, maxUploads - uploadCount)} of {maxUploads}{" "}
                      {t("uploads_left")}
                    </span>
                    ).
                  </p>
                </div>
              </div>
            </div>

            {/* API Key Form */}
            <div className="space-y-2">
              <label
                htmlFor="settings-api-key"
                className="block text-xs font-mono font-semibold text-fg-secondary uppercase tracking-wider"
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
                  className="w-full px-4 py-3 rounded-xl text-xs font-mono bg-surface-2 border border-border text-fg outline-none focus:border-primary  transition-all"
                />
                {apiKeyInput.length > 0 && (
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" />
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-fg-tertiary pt-1">
                <LockKey size={13} weight="duotone" className="text-success" />
                <span>{t("key_storage_hint")}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="space-y-5 text-xs text-fg-secondary leading-relaxed">
            <div className="p-5 rounded-2xl bg-surface-2/80 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold font-display text-fg">
                    Audins
                  </h4>
                  <p className="text-[10px] font-mono font-semibold tracking-wider text-fg-tertiary uppercase">
                    Audio Insight
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-surface-2 text-fg-tertiary border border-border">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-fg-secondary">
                High-speed audio intelligence platform for speech-to-text
                transcription and structured executive summaries.
              </p>
            </div>

            {/* Tech Architecture Stack */}
            <div className="space-y-2">
              <h5 className="text-[11px] font-mono font-semibold text-fg-tertiary uppercase tracking-wider">
                Tech Stack
              </h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-surface-2 border border-border flex items-center gap-2">
                  <Lightning
                    size={16}
                    weight="duotone"
                    className="text-fg-tertiary"
                  />
                  <div>
                    <p className="font-semibold text-fg">Whisper LPU</p>
                    <p className="text-[10px] font-mono text-fg-tertiary">
                      Speech-to-Text
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-border flex items-center gap-2">
                  <Cpu
                    size={16}
                    weight="duotone"
                    className="text-fg-tertiary"
                  />
                  <div>
                    <p className="font-semibold text-fg">Llama 3.3 70B</p>
                    <p className="text-[10px] font-mono text-fg-tertiary">
                      Summarization
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-border flex items-center gap-2">
                  <HardDrives
                    size={16}
                    weight="duotone"
                    className="text-fg-tertiary"
                  />
                  <div>
                    <p className="font-semibold text-fg">Cloudflare R2</p>
                    <p className="text-[10px] font-mono text-fg-tertiary">
                      Audio Storage
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-border flex items-center gap-2">
                  <Globe
                    size={16}
                    weight="duotone"
                    className="text-fg-tertiary"
                  />
                  <div>
                    <p className="font-semibold text-fg">React 19 + Vite</p>
                    <p className="text-[10px] font-mono text-fg-tertiary">
                      Frontend Studio
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border bg-surface-2/40 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs" role="status">
          {saveMessage && (
            <span className="text-success font-mono flex items-center gap-1.5 animate-fade-in">
              <CheckCircle size={14} weight="fill" />
              {saveMessage}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border transition-colors min-h-[36px]"
          >
            {t("btn_close")}
          </button>
          {activeTab === "api" && (
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover transition-colors min-h-[36px]"
            >
              {t("btn_save_config")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
