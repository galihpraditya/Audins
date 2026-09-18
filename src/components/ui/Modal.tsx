import { ReactNode, useEffect, useRef } from "react"

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  onClose: () => void
  /** id of the element that labels this dialog (for aria-labelledby). */
  labelledBy?: string
  /** Additional classes for the inner panel (width, styling, etc). */
  panelClassName?: string
  children: ReactNode
  /** Allow Escape / backdrop click to close (disable e.g. during recording). */
  dismissible?: boolean
}

/**
 * Shared modal scaffold: backdrop, ESC-to-close, focus trap, body scroll lock
 * and focus restoration. Replaces five previously duplicated modal
 * implementations.
 */
export default function Modal({
  onClose,
  labelledBy,
  panelClassName = "",
  children,
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Keep the latest callbacks in refs so the trap effect runs ONCE per mount.
  // Keying on `onClose` re-ran the effect on every parent render (parents pass
  // inline arrows), repeatedly yanking focus back to the first control —
  // dangerous in confirmation dialogs while uploads tick state at ~10 Hz.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissibleRef = useRef(dismissible)
  dismissibleRef.current = dismissible

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move initial focus into the dialog.
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      FOCUSABLE_SELECTOR,
    )
    ;(firstFocusable ?? panelRef.current)?.focus()

    // Lock background scrolling while the dialog is open (touch/drag on the
    // backdrop used to scroll the page underneath).
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      if (e.key === "Tab" && panelRef.current) {
        // Focus trap: cycle Tab within the dialog.
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.offsetParent !== null)
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`outline-none max-h-[calc(100dvh-2rem)] overflow-y-auto ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
