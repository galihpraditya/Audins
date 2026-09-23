import { useState, useTransition } from "react"
import { DocumentItem } from "../../types"
import Modal from "../ui/Modal"
import { useLanguage } from "../../context/LanguageContext"
import { useToast } from "../ui/ToastContext"
import { updateDocumentShareSettingsApi } from "../../services/api"
import {
  ShareNetwork,
  Copy,
  Check,
  Globe,
  Lock,
  SpeakerHigh,
  FileText,
  Sparkle,
  ArrowSquareOut,
  ArrowClockwise,
  X,
} from "@phosphor-icons/react"

interface ShareModalProps {
  document: DocumentItem
  onClose: () => void
  onUpdateDoc: (updated: DocumentItem) => void
}

export default function ShareModal({
  document,
  onClose,
  onUpdateDoc,
}: ShareModalProps) {
  const { t } = useLanguage()
  const { showToast } = useToast()

  const [isPublic, setIsPublic] = useState<boolean>(
    document.shareSettings?.isPublic ?? false,
  )
  const [includeAudio, setIncludeAudio] = useState<boolean>(
    document.shareSettings?.includeAudio ?? true,
  )
  const [includeTranscript, setIncludeTranscript] = useState<boolean>(
    document.shareSettings?.includeTranscript ?? true,
  )
  const [includeSummary, setIncludeSummary] = useState<boolean>(
    document.shareSettings?.includeSummary ?? true,
  )
  const [shareId, setShareId] = useState<string>(
    document.shareSettings?.shareId ?? "",
  )

  const [copied, setCopied] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [, startTransition] = useTransition()

  const hasAudio = Boolean(document.audioUrl && document.audioUrl !== "Expired")
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const shareUrl = shareId ? `${origin}/s/${shareId}` : ""

  const handleTogglePublic = async (nextPublic: boolean) => {
    setIsPublic(nextPublic)
    setIsSaving(true)
    try {
      const updated = await updateDocumentShareSettingsApi(document.id, {
        isPublic: nextPublic,
        includeAudio,
        includeTranscript,
        includeSummary,
      })
      if (updated.shareSettings?.shareId) {
        setShareId(updated.shareSettings.shareId)
      }
      onUpdateDoc(updated)
      showToast(t("share_toast_updated"), "success")
    } catch (err) {
      console.error("Failed to toggle share status:", err)
      setIsPublic(!nextPublic)
      showToast(t("error_save_failed"), "error")
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateOption = async (
    key: "includeAudio" | "includeTranscript" | "includeSummary",
    val: boolean,
  ) => {
    let nextAudio = includeAudio
    let nextTranscript = includeTranscript
    let nextSummary = includeSummary

    if (key === "includeAudio") {
      setIncludeAudio(val)
      nextAudio = val
    } else if (key === "includeTranscript") {
      setIncludeTranscript(val)
      nextTranscript = val
    } else if (key === "includeSummary") {
      setIncludeSummary(val)
      nextSummary = val
    }

    if (!isPublic) return

    setIsSaving(true)
    try {
      const updated = await updateDocumentShareSettingsApi(document.id, {
        isPublic: true,
        includeAudio: nextAudio,
        includeTranscript: nextTranscript,
        includeSummary: nextSummary,
      })
      onUpdateDoc(updated)
      showToast(t("share_toast_updated"), "success")
    } catch (err) {
      console.error("Failed to update share options:", err)
      showToast(t("error_save_failed"), "error")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRegenerateLink = async () => {
    setIsSaving(true)
    try {
      const updated = await updateDocumentShareSettingsApi(document.id, {
        isPublic: true,
        includeAudio,
        includeTranscript,
        includeSummary,
        regenerateShareId: true,
      })
      if (updated.shareSettings?.shareId) {
        setShareId(updated.shareSettings.shareId)
      }
      onUpdateDoc(updated)
      setConfirmRegenerate(false)
      showToast(t("share_toast_updated"), "success")
    } catch (err) {
      console.error("Failed to regenerate share link:", err)
      showToast(t("error_save_failed"), "error")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      showToast(t("share_toast_link_copied"), "success")
      setTimeout(() => setCopied(false), 2500)
    } catch {
      showToast("Gagal menyalin tautan", "error")
    }
  }

  const handleNativeShare = async () => {
    if (!shareUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.name,
          text: `Dengarkan dan baca catatan ${document.name} di Audins`,
          url: shareUrl,
        })
      } catch {
        /* user dismissed share dialog */
      }
    } else {
      void handleCopyLink()
    }
  }

  return (
    <Modal
      onClose={onClose}
      panelClassName="w-full max-w-md bg-surface border border-border rounded-2xl shadow-raised p-5 sm:p-6 space-y-5 animate-scale-in"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-dim text-fg flex items-center justify-center flex-shrink-0">
            <ShareNetwork size={20} weight="duotone" />
          </div>
          <div>
            <h3 className="text-base font-bold font-display text-fg">
              {t("share_modal_title")}
            </h3>
            <p className="text-xs text-fg-secondary mt-0.5 line-clamp-1">
              {document.name}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-fg-tertiary hover:text-fg p-1.5 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
          aria-label={t("btn_close")}
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      {/* Main Public Toggle Card */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          isPublic
            ? "bg-surface-2 border-border"
            : "bg-surface-2/60 border-border-subtle"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                isPublic
                  ? "bg-success-dim text-success"
                  : "bg-surface-3 text-fg-tertiary"
              }`}
            >
              {isPublic ? (
                <Globe size={18} weight="duotone" />
              ) : (
                <Lock size={18} weight="duotone" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-fg">
                {t("share_toggle_label")}
              </p>
              <p className="text-[11px] text-fg-secondary">
                {isPublic
                  ? t("share_toggle_desc_on")
                  : t("share_toggle_desc_off")}
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            disabled={isSaving}
            onClick={() => handleTogglePublic(!isPublic)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 ${
              isPublic ? "bg-primary" : "bg-surface-3"
            } ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out ${
                isPublic ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Share Link Input (when active) */}
      {isPublic && (
        <div className="space-y-4 animate-scale-in">
          <div>
            <label className="block text-[10px] font-mono font-bold tracking-wider text-fg-tertiary uppercase mb-1.5">
              {t("share_link_label")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs font-mono text-fg select-all focus:outline-none focus:border-border-hover truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 ${
                  copied
                    ? "bg-success text-white"
                    : "bg-primary text-primary-contrast hover:bg-primary-hover shadow-sm"
                }`}
              >
                {copied ? (
                  <>
                    <Check size={14} weight="bold" />
                    <span>{t("share_link_copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} weight="bold" />
                    <span>{t("share_btn_copy_link")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Granular Content Controls */}
          <div>
            <label className="block text-[10px] font-mono font-bold tracking-wider text-fg-tertiary uppercase mb-2">
              {t("share_content_options")}
            </label>
            <div className="space-y-2 bg-surface-2/60 border border-border rounded-xl p-3">
              {/* Option 1: Audio Playback */}
              <label
                className={`flex items-start justify-between gap-3 text-xs select-none cursor-pointer ${
                  !hasAudio ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <SpeakerHigh
                    size={16}
                    weight="duotone"
                    className="text-fg-secondary mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="font-semibold text-fg">
                      {t("share_opt_audio")}
                    </p>
                    <p className="text-[11px] text-fg-tertiary">
                      {hasAudio
                        ? t("share_opt_audio_hint")
                        : t("share_opt_audio_unavailable")}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!hasAudio}
                  checked={hasAudio && includeAudio}
                  onChange={(e) =>
                    handleUpdateOption("includeAudio", e.target.checked)
                  }
                  className="rounded border-border text-primary focus:ring-primary mt-1 cursor-pointer"
                />
              </label>

              <div className="h-px bg-border/60" />

              {/* Option 2: AI Summary */}
              <label className="flex items-start justify-between gap-3 text-xs select-none cursor-pointer">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Sparkle
                    size={16}
                    weight="duotone"
                    className="text-fg-secondary mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="font-semibold text-fg">
                      {t("share_opt_summary")}
                    </p>
                    <p className="text-[11px] text-fg-tertiary">
                      {t("share_opt_summary_hint")}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) =>
                    handleUpdateOption("includeSummary", e.target.checked)
                  }
                  className="rounded border-border text-primary focus:ring-primary mt-1 cursor-pointer"
                />
              </label>

              <div className="h-px bg-border/60" />

              {/* Option 3: Full Transcript */}
              <label className="flex items-start justify-between gap-3 text-xs select-none cursor-pointer">
                <div className="flex items-start gap-2.5 min-w-0">
                  <FileText
                    size={16}
                    weight="duotone"
                    className="text-fg-secondary mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <p className="font-semibold text-fg">
                      {t("share_opt_transcript")}
                    </p>
                    <p className="text-[11px] text-fg-tertiary">
                      {t("share_opt_transcript_hint")}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeTranscript}
                  onChange={(e) =>
                    handleUpdateOption("includeTranscript", e.target.checked)
                  }
                  className="rounded border-border text-primary focus:ring-primary mt-1 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* System Share Dialog */}
          <div>
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-fg transition-all cursor-pointer shadow-xs active:scale-[0.99]"
            >
              <ShareNetwork size={16} weight="duotone" className="text-fg-secondary" />
              <span>{t("share_btn_system_dialog")}</span>
            </button>
          </div>

          {/* Action Row */}
          <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-secondary hover:text-fg transition-colors"
            >
              <ArrowSquareOut size={14} weight="bold" />
              <span>{t("share_btn_preview")}</span>
            </a>

            {confirmRegenerate ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-danger font-medium">
                  {t("share_regenerate_confirm")}
                </span>
                <button
                  type="button"
                  onClick={handleRegenerateLink}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-danger text-white hover:bg-danger/90 cursor-pointer"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRegenerate(false)}
                  className="px-2 py-1 text-xs text-fg-secondary hover:text-fg cursor-pointer"
                >
                  {t("btn_cancel")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                className="inline-flex items-center gap-1.5 text-xs text-fg-tertiary hover:text-danger transition-colors cursor-pointer"
              >
                <ArrowClockwise size={13} weight="bold" />
                <span>{t("share_btn_regenerate")}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
