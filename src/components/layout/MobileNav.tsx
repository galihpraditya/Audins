import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { X } from "@phosphor-icons/react"
import Logo from "./Logo"
import { NavItems, SettingsNavItem, UserSidebarItem } from "./Sidebar"
import FreeTierBar from "../dashboard/FreeTierBar"

interface MobileNavProps {
  open: boolean
  setOpen: (v: boolean) => void
  uploadCount: number
  maxUploads?: number
  storageUsed?: number
  storageLimit?: number
  hasCustomKey?: boolean
  apiKeyStatus?: "idle" | "validating" | "valid" | "invalid"
}

export default function MobileNav({
  open,
  setOpen,
  uploadCount,
  maxUploads,
  storageUsed,
  storageLimit,
  hasCustomKey,
  apiKeyStatus,
}: MobileNavProps) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  const goSettings = () => {
    setOpen(false)
    navigate("/settings")
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 md:hidden bg-black/70 animate-fade-in print:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer.
          inert + aria-hidden keep the closed drawer out of tab order and
          invisible to screen readers (it previously stayed focusable). */}
      <aside
        className={`fixed top-0 left-0 h-full w-[280px] z-50 flex flex-col md:hidden bg-surface border-r border-border shadow-raised transition-transform duration-200 print:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile Navigation"
        aria-hidden={!open}
        inert={!open}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <Logo />
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavItems onNavigate={() => setOpen(false)} />
        </nav>

        {/* Drawer bottom — Daily quota and Settings below it */}
        <div className="flex flex-col gap-3 px-3 pb-6 border-t border-border pt-4">
          <FreeTierBar
            onUpgrade={goSettings}
            uploadCount={uploadCount}
            maxUploads={maxUploads}
            storageUsed={storageUsed}
            storageLimit={storageLimit}
            hasCustomKey={hasCustomKey}
            apiKeyStatus={apiKeyStatus}
          />
          <UserSidebarItem onNavigate={() => setOpen(false)} />
          <SettingsNavItem onNavigate={() => setOpen(false)} />
        </div>
      </aside>
    </>
  )
}
