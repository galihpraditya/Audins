import { Screen, DocumentItem } from "../../types"
import Logo from "./Logo"
import FreeTierBar from "../dashboard/FreeTierBar"

interface SidebarProps {
  screen: Screen
  setScreen: (s: Screen) => void
  setModal: (v: boolean) => void
  onOpenSettings: () => void
  uploadCount: number
  storageUsed?: number
  storageLimit?: number
  hasCustomKey?: boolean
  apiKeyStatus?: "idle" | "validating" | "valid" | "invalid"
  documents: DocumentItem[]
  activeDocument?: DocumentItem | null
  onSelectDocument?: (doc: DocumentItem) => void
  onDeleteDocument?: (id: number | string) => void
  onRenameDocument?: (id: number | string, newName: string) => void
  onDuplicateDocument?: (doc: DocumentItem) => void
}

export function NavItems({
  screen,
  setScreen,
  onNavigate,
}: {
  screen: Screen
  setScreen: (s: Screen) => void
  onNavigate?: () => void
}) {
  const items = [
    {
      id: "dashboard" as Screen,
      label: "Dashboard",
      icon: (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-4 h-4 flex-shrink-0"
        >
          <rect x="1" y="1" width="6" height="6" rx="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" />
        </svg>
      ),
    },
    {
      id: "workspace" as Screen,
      label: "Workspace / Files",
      icon: (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-4 h-4 flex-shrink-0"
        >
          <path d="M2 3.5A1.5 1.5 0 013.5 2h5.379a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0113.5 6.62V12.5A1.5 1.5 0 0112 14H3.5A1.5 1.5 0 012 12.5v-9z" />
          <path d="M9 2v3.5A1.5 1.5 0 0010.5 7H14" />
        </svg>
      ),
    },
  ]

  return (
    <>
      {items.map((item) => {
        const isActive = screen === item.id
        return (
          <button
            key={item.id}
            onClick={() => {
              setScreen(item.id)
              onNavigate?.()
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-primary-dim text-primary-hover border border-indigo-500/20 shadow-sm"
                : "text-fg-secondary hover:text-fg hover:bg-surface-2"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </>
  )
}

export default function Sidebar({
  screen,
  setScreen,
  setModal,
  onOpenSettings,
  uploadCount,
  storageUsed,
  storageLimit,
  hasCustomKey,
  apiKeyStatus,
}: SidebarProps) {
  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-surface print:hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Logo />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavItems screen={screen} setScreen={setScreen} />
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-2 mt-auto p-3 border-t border-border">
        <FreeTierBar
          onUpgrade={() => setModal(true)}
          uploadCount={uploadCount}
          storageUsed={storageUsed}
          storageLimit={storageLimit}
          hasCustomKey={hasCustomKey}
          apiKeyStatus={apiKeyStatus}
        />

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
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
  )
}
