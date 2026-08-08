import { useState, useEffect } from "react"
import { Screen } from "../../types"
import Logo from "./Logo"
import { NavItems } from "./Sidebar"
import FreeTierBar from "../dashboard/FreeTierBar"

interface MobileNavProps {
  screen: Screen
  setScreen: (s: Screen) => void
  setModal: (v: boolean) => void
  onOpenSettings: () => void
  uploadCount: number
  storageUsed?: number
  storageLimit?: number
  hasCustomKey?: boolean
  apiKeyStatus?: "idle" | "validating" | "valid" | "invalid"
}

export default function MobileNav({
  screen,
  setScreen,
  setModal,
  onOpenSettings,
  uploadCount,
  storageUsed,
  storageLimit,
  hasCustomKey,
  apiKeyStatus,
}: MobileNavProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface sticky top-0 z-30 print:hidden">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
          aria-label="Open navigation menu"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-4 h-4"
          >
            <path strokeLinecap="round" d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 md:hidden bg-black/60 backdrop-blur-sm animate-fade-in print:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-[260px] z-50 flex flex-col md:hidden bg-surface border-r border-border transition-transform duration-300 print:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile Navigation"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <Logo />
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors"
            aria-label="Close menu"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-4 h-4"
            >
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItems
            screen={screen}
            setScreen={setScreen}
            onNavigate={() => setOpen(false)}
          />
        </nav>

        {/* Drawer bottom */}
        <div className="flex flex-col gap-2 px-3 pb-6 border-t border-border pt-4">
          <FreeTierBar
            onUpgrade={() => {
              setOpen(false)
              setModal(true)
            }}
            uploadCount={uploadCount}
            storageUsed={storageUsed}
            storageLimit={storageLimit}
            hasCustomKey={hasCustomKey}
            apiKeyStatus={apiKeyStatus}
          />
          <button
            onClick={() => {
              setOpen(false)
              onOpenSettings()
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-all duration-150"
            aria-label="Settings"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-4 h-4 flex-shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
        </div>
      </aside>
    </>
  )
}
