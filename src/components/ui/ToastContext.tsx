import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from "react"

import { CheckCircle, WarningOctagon, Info, X } from "@phosphor-icons/react"

import { useLanguage } from "../../context/LanguageContext"

export type ToastType = "success" | "error" | "info"

interface ToastMessage {
  id: number

  message: string

  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }

  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage()

  const [toasts, setToasts] = useState<ToastMessage[]>([])

  // Monotonic counter avoids the Date.now() id collisions that made two

  // toasts share a React key and disappear together.

  const idCounterRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++idCounterRef.current

      setToasts((prev) => [...prev.slice(-4), { id, message, type }])

      setTimeout(() => {
        setToasts((prev) => prev.filter((toastItem) => toastItem.id !== id))
      }, 4500)
    },

    [],
  )

  // Stable value: adding a toast no longer re-renders every consumer subtree.

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Live region so screen readers announce status changes. */}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4 sm:px-0"
        aria-live="polite"
        aria-label={t("toast_region_label")}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto relative flex items-center justify-between gap-3 p-4 pl-5 rounded-xl border border-border bg-surface shadow-raised animate-fade-in overflow-hidden ${
              toast.type === "error"
                ? "border-l-danger"
                : toast.type === "success"
                  ? "border-l-success"
                  : "border-l-primary"
            }`}
          >
            {/* Left accent rail */}
            <span
              aria-hidden="true"
              className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                toast.type === "error"
                  ? "bg-danger"
                  : toast.type === "success"
                    ? "bg-success"
                    : "bg-primary"
              }`}
            />
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0">
                {toast.type === "error" && (
                  <WarningOctagon
                    size={18}
                    weight="fill"
                    className="text-danger"
                  />
                )}
                {toast.type === "success" && (
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="text-success"
                  />
                )}
                {toast.type === "info" && (
                  <Info size={18} weight="duotone" className="text-primary" />
                )}
              </div>
              <p className="text-xs sm:text-sm font-medium leading-snug text-fg">
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => dismiss(toast.id)}
              className="text-fg-tertiary hover:text-fg transition-colors p-1.5 rounded-lg flex-shrink-0"
              aria-label={t("toast_dismiss")}
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
