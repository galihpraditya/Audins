import { useState, useEffect, FormEvent } from "react"

import { useLanguage } from "../../context/LanguageContext"

import { useAuth } from "../../context/AuthContext"

import { useToast } from "../ui/ToastContext"

import Modal from "../ui/Modal"

import {
  UserCircle,
  EnvelopeSimple,
  LockKey,
  Eye,
  EyeSlash,
  Spinner,
  X,
  DeviceMobile,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react"

interface AuthModalProps {
  open: boolean

  initialTab?: "login" | "register"

  onClose: () => void

  onSuccess?: () => void
}

export default function AuthModal({
  open,

  initialTab = "login",

  onClose,

  onSuccess,
}: AuthModalProps) {
  const { t } = useLanguage()

  const { login, register } = useAuth()

  const { showToast } = useToast()

  const [tab, setTab] = useState<"login" | "register">(initialTab)

  const [email, setEmail] = useState("")

  const [password, setPassword] = useState("")

  const [confirmPassword, setConfirmPassword] = useState("")

  const [name, setName] = useState("")

  const [claimGuestRecordings, setClaimGuestRecordings] = useState(true)

  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTab(initialTab)

      setError(null)
    }
  }, [open, initialTab])

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    setError(null)

    if (!email.trim()) {
      setError(t("auth_email_label") + " is required")

      return
    }

    if (!password) {
      setError(t("auth_password_label") + " is required")

      return
    }

    if (tab === "register") {
      if (password.length < 6) {
        setError(t("auth_password_placeholder"))

        return
      }

      if (password !== confirmPassword) {
        setError(t("auth_password_mismatch"))

        return
      }
    }

    setLoading(true)

    try {
      if (tab === "login") {
        const res = await login(
          { email: email.trim(), password },

          claimGuestRecordings,
        )

        showToast(
          `${t("auth_logged_in_as")} ${res.user.email}`,

          "success",
        )

        if (res.claimedCount && res.claimedCount > 0) {
          showToast(
            t("sync_claimed_toast", { count: res.claimedCount }),

            "success",
          )
        }
      } else {
        const res = await register(
          {
            email: email.trim(),

            password,

            name: name.trim() || undefined,
          },

          claimGuestRecordings,
        )

        showToast(
          `${t("auth_logged_in_as")} ${res.user.email}`,

          "success",
        )

        if (res.claimedCount && res.claimedCount > 0) {
          showToast(
            t("sync_claimed_toast", { count: res.claimedCount }),

            "success",
          )
        }
      }

      onSuccess?.()

      onClose()
    } catch (err: any) {
      setError(err?.message || "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="auth-modal-title"
      panelClassName="w-full max-w-md rounded-2xl bg-surface border border-border shadow-raised animate-scale-in"
    >
      <div className="p-6 sm:p-8 space-y-6">
        {/* Header with Icon & Close Button */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary-dim border border-primary/20 text-primary">
              <UserCircle size={26} weight="duotone" />
            </div>
            <div>
              <h2
                id="auth-modal-title"
                className="text-base sm:text-lg font-bold font-display text-fg tracking-tight mt-1"
              >
                {tab === "login"
                  ? t("auth_modal_title_login")
                  : t("auth_modal_title_register")}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors min-h-[36px]"
            aria-label={t("btn_close")}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-2 border border-border">
          <button
            type="button"
            onClick={() => {
              setTab("login")

              setError(null)
            }}
            className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tab === "login"
                ? "bg-surface text-fg shadow-card"
                : "text-fg-tertiary hover:text-fg"
            }`}
          >
            {t("auth_sign_in")}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register")

              setError(null)
            }}
            className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tab === "register"
                ? "bg-surface text-fg shadow-card"
                : "text-fg-tertiary hover:text-fg"
            }`}
          >
            {t("auth_sign_up")}
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-danger-dim border border-danger/25 text-danger text-xs flex items-center gap-2.5">
            <WarningCircle size={16} weight="fill" className="flex-shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "register" && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary">
                {t("auth_name_label")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("auth_name_placeholder")}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-surface border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary">
              {t("auth_email_label")}
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-surface border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary transition-colors"
              />
              <EnvelopeSimple
                size={16}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary">
              {t("auth_password_label")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth_password_placeholder")}
                className="w-full pl-9 pr-10 py-2.5 rounded-xl text-xs bg-surface border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary transition-colors"
              />
              <LockKey
                size={16}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-tertiary hover:text-fg p-1 cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <EyeSlash size={15} weight="duotone" />
                ) : (
                  <Eye size={15} weight="duotone" />
                )}
              </button>
            </div>
          </div>

          {tab === "register" && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary">
                {t("auth_confirm_password_label")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth_password_placeholder")}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs bg-surface border border-border text-fg placeholder:text-fg-tertiary outline-none focus:border-primary transition-colors"
                />
                <LockKey
                  size={16}
                  weight="duotone"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"
                />
              </div>
            </div>
          )}

          {/* Sync guest recordings checkbox */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-fg-secondary select-none">
              <input
                type="checkbox"
                checked={claimGuestRecordings}
                onChange={(e) => setClaimGuestRecordings(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
              />
              <span className="text-[11px] leading-snug">
                {t("auth_claim_guest_recordings")}
              </span>
            </label>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-contrast hover:bg-primary-hover disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[40px] shadow-sm"
          >
            {loading ? (
              <>
                <Spinner size={14} className="animate-spin" />
                <span>
                  {tab === "login"
                    ? t("auth_btn_signing_in")
                    : t("auth_btn_signing_up")}
                </span>
              </>
            ) : (
              <>
                <CheckCircle size={15} weight="bold" />
                <span>
                  {tab === "login"
                    ? t("auth_btn_sign_in")
                    : t("auth_btn_sign_up")}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Bottom switcher prompt */}
        <div className="pt-2 text-center text-xs text-fg-tertiary">
          {tab === "login" ? (
            <p>
              {t("auth_no_account")}{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("register")

                  setError(null)
                }}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                {t("auth_sign_up")}
              </button>
            </p>
          ) : (
            <p>
              {t("auth_have_account")}{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("login")

                  setError(null)
                }}
                className="font-semibold text-primary hover:underline cursor-pointer"
              >
                {t("auth_sign_in")}
              </button>
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
