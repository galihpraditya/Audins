import { useState, useRef, useEffect } from "react"
import Modal from "../ui/Modal"
import { useLanguage } from "../../context/LanguageContext"
import {
  ArrowsClockwise,
  Translate,
  X,
  Sparkle,
  Info,
  Check,
} from "@phosphor-icons/react"

interface RetranscribeModalProps {
  open: boolean
  docName: string
  onClose: () => void
  onSubmit: (options: {
    language: string
    prompt: string
    regenerateSummary: boolean
  }) => Promise<void>
}

const LANGUAGE_PRESETS = [
  { id: "id", labelKey: "retranscribe_lang_id", flag: "🇮🇩" },
  { id: "en", labelKey: "retranscribe_lang_en", flag: "🇺🇸" },
  { id: "auto", labelKey: "retranscribe_lang_auto", flag: "🌐" },
  { id: "jv", labelKey: "retranscribe_lang_jv", flag: "🇮🇩" },
]

export default function RetranscribeModal({
  open,
  docName,
  onClose,
  onSubmit,
}: RetranscribeModalProps) {
  const { t } = useLanguage()
  const [selectedLang, setSelectedLang] = useState<string>("id")
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [regenerateSummary, setRegenerateSummary] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSubmit({
        language: selectedLang,
        prompt: customPrompt.trim(),
        regenerateSummary,
      })
      if (isMountedRef.current) {
        onClose()
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err?.message || "Failed to re-transcribe")
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  return (
    <Modal
      onClose={onClose}
      dismissible={true}
      labelledBy="retranscribe-modal-title"
      panelClassName="bg-surface border border-border w-full max-w-lg rounded-2xl shadow-raised animate-scale-in flex flex-col overflow-hidden"
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-dim text-primary flex items-center justify-center">
            <Translate size={22} weight="duotone" />
          </div>
          <div>
            <h3
              id="retranscribe-modal-title"
              className="text-base sm:text-lg font-bold font-display text-fg tracking-tight"
            >
              {t("modal_retranscribe_title")}
            </h3>
            <p className="text-xs text-fg-tertiary truncate max-w-[260px] sm:max-w-xs">
              {docName}
            </p>
          </div>
        </div>
        {/* Always visible Exit / Close (X) button */}
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
          aria-label={t("btn_close")}
          title={t("btn_close")}
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      {/* Modal Form Body */}
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-5 flex-1 overflow-y-auto"
      >
        {/* Informative Hint Banner */}
        <div className="p-3.5 rounded-xl bg-surface-2/80 border border-border text-xs text-fg-secondary flex items-start gap-2.5 leading-relaxed">
          <Info
            size={18}
            weight="fill"
            className="text-primary flex-shrink-0 mt-0.5"
          />
          <p>{t("modal_retranscribe_desc")}</p>
        </div>

        {/* Processing Indicator Banner with Exit Link */}
        {loading && (
          <div className="p-3.5 rounded-xl bg-primary-dim/30 border border-primary/30 text-xs text-primary flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <ArrowsClockwise
                size={16}
                weight="bold"
                className="animate-spin flex-shrink-0"
              />
              <span className="truncate">
                {t("toast_retranscribe_started")}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-semibold underline text-primary hover:text-fg flex-shrink-0 cursor-pointer"
              title={t("btn_close")}
            >
              {t("btn_close")} (X)
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-danger-dim border border-danger/25 text-xs text-danger font-medium">
            {error}
          </div>
        )}

        {/* Language Selection */}
        <div className="space-y-2">
          <label className="block text-[11px] font-mono font-semibold text-fg-secondary uppercase tracking-wider">
            {t("retranscribe_lang_label")}
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {LANGUAGE_PRESETS.map((preset) => {
              const isSelected = selectedLang === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={loading}
                  onClick={() => setSelectedLang(preset.id)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    isSelected
                      ? "border-primary bg-primary-dim/30 text-fg shadow-xs"
                      : "border-border bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base flex-shrink-0">
                      {preset.flag}
                    </span>
                    <span className="text-xs font-semibold truncate">
                      {t(preset.labelKey as any)}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-contrast flex items-center justify-center flex-shrink-0">
                      <Check size={12} weight="bold" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Vocabulary / Glossary Guidance (Optional) */}
        <div className="space-y-2">
          <label
            htmlFor="whisper-prompt"
            className="block text-[11px] font-mono font-semibold text-fg-secondary uppercase tracking-wider"
          >
            {t("retranscribe_prompt_label")}
          </label>
          <input
            id="whisper-prompt"
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={t("retranscribe_prompt_placeholder")}
            className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-surface-2 border border-border text-fg outline-none focus:border-primary transition-colors font-sans disabled:opacity-60"
            disabled={loading}
          />
        </div>

        {/* Auto Regenerate Summary Option */}
        <div className="pt-1">
          <label
            className={`flex items-center gap-3 select-none ${
              loading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            } group`}
          >
            <input
              type="checkbox"
              checked={regenerateSummary}
              onChange={(e) => setRegenerateSummary(e.target.checked)}
              disabled={loading}
              className="w-4 h-4 rounded text-primary focus:ring-primary/20 accent-primary cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-2 text-xs font-medium text-fg group-hover:text-primary transition-colors">
              <Sparkle size={14} weight="duotone" className="text-primary" />
              <span>{t("retranscribe_auto_summary")}</span>
            </div>
          </label>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 border border-border transition-colors cursor-pointer min-h-[38px]"
          >
            {loading ? t("btn_close") : t("btn_cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover active:scale-95 transition-all flex items-center gap-2 shadow-sm cursor-pointer min-h-[38px] disabled:opacity-50"
          >
            <ArrowsClockwise
              size={15}
              weight="bold"
              className={loading ? "animate-spin" : ""}
            />
            <span>
              {loading
                ? t("toast_retranscribe_started")
                : t("btn_start_retranscribe")}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
