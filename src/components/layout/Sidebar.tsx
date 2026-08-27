import { useState, useEffect } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import Logo from "./Logo"
import FreeTierBar from "../dashboard/FreeTierBar"
import { useLanguage } from "../../context/LanguageContext"
import {
  SquaresFour,
  FolderSimpleStar,
  GearSix,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react"

interface SidebarProps {
  uploadCount: number
  maxUploads?: number
  storageUsed?: number
  storageLimit?: number
  hasCustomKey?: boolean
  apiKeyStatus?: "idle" | "validating" | "valid" | "invalid"
}

export function NavItems({
  onNavigate,
  isCollapsed = false,
}: {
  onNavigate?: () => void
  isCollapsed?: boolean
}) {
  const { t } = useLanguage()

  const items = [
    {
      to: "/",
      label: t("nav_dashboard"),
      icon: (isActive: boolean) => (
        <SquaresFour size={20} weight={isActive ? "fill" : "duotone"} />
      ),
    },
    {
      to: "/workspace",
      label: t("nav_workspace"),
      icon: (isActive: boolean) => (
        <FolderSimpleStar size={20} weight={isActive ? "fill" : "duotone"} />
      ),
    },
  ]

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={() => onNavigate?.()}
          title={isCollapsed ? item.label : undefined}
          className={({ isActive }) =>
            `w-full flex items-center ${
              isCollapsed ? "justify-center px-0" : "gap-3 px-3.5"
            } py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group ${
              isActive
                ? "bg-primary-dim text-primary font-semibold"
                : "text-fg-secondary hover:text-fg hover:bg-surface-2 border border-transparent"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
              )}
              <span
                className={`transition-colors duration-150 ${
                  isActive ? "text-primary" : "text-fg-tertiary group-hover:text-fg"
                }`}
              >
                {item.icon(isActive)}
              </span>
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

export function SettingsNavItem({
  onNavigate,
  isCollapsed = false,
}: {
  onNavigate?: () => void
  isCollapsed?: boolean
}) {
  const { t } = useLanguage()

  return (
    <NavLink
      to="/settings"
      onClick={() => onNavigate?.()}
      title={isCollapsed ? t("nav_settings") : undefined}
      className={({ isActive }) =>
        `w-full flex items-center ${
          isCollapsed ? "justify-center px-0" : "gap-3 px-3.5"
        } py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group ${
          isActive
            ? "bg-primary-dim text-primary font-semibold"
            : "text-fg-secondary hover:text-fg hover:bg-surface-2 border border-transparent"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
          )}
          <span
            className={`transition-colors duration-150 ${
              isActive ? "text-primary" : "text-fg-tertiary group-hover:text-fg"
            }`}
          >
            <GearSix size={20} weight={isActive ? "fill" : "duotone"} />
          </span>
          {!isCollapsed && <span className="truncate">{t("nav_settings")}</span>}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({
  uploadCount,
  maxUploads,
  storageUsed,
  storageLimit,
  hasCustomKey,
  apiKeyStatus,
}: SidebarProps) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("audin_sidebar_collapsed") === "true"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem("audin_sidebar_collapsed", isCollapsed.toString())
    } catch {
      /* non-fatal */
    }
  }, [isCollapsed])

  return (
    <aside
      className={`hidden md:flex flex-shrink-0 flex-col border-r border-border bg-surface transition-colors duration-200 print:hidden z-20 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Logo & Header */}
      <div
        className={`border-b border-border relative group flex ${
          isCollapsed
            ? "justify-center items-center px-2 py-5"
            : "items-center justify-between px-4 py-4.5"
        }`}
      >
        <Logo isCollapsed={isCollapsed} />

        {/* Toggle Collapse Button */}
        <button
          onClick={(e) => {
            e.currentTarget.blur()
            setIsCollapsed(!isCollapsed)
          }}
          title={isCollapsed ? t("a11y_expand_sidebar") : t("a11y_collapse_sidebar")}
          aria-label={isCollapsed ? t("a11y_expand_sidebar") : t("a11y_collapse_sidebar")}
          className={
            isCollapsed
              ? "absolute inset-0 m-auto w-9 h-9 rounded-xl flex items-center justify-center bg-surface-2 border border-border text-fg shadow-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 cursor-pointer"
              : "w-7 h-7 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 border border-transparent hover:border-border transition-colors cursor-pointer"
          }
        >
          {isCollapsed ? (
            <CaretRight size={15} weight="bold" />
          ) : (
            <CaretLeft size={15} weight="bold" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavItems isCollapsed={isCollapsed} />
      </nav>

      {/* Bottom Area: Quota / Daily Limit & Settings */}
      <div className="flex flex-col gap-2.5 mt-auto p-3 border-t border-border">
        {!isCollapsed ? (
          <FreeTierBar
            onUpgrade={() => navigate("/settings")}
            uploadCount={uploadCount}
            maxUploads={maxUploads}
            storageUsed={storageUsed}
            storageLimit={storageLimit}
            hasCustomKey={hasCustomKey}
            apiKeyStatus={apiKeyStatus}
          />
        ) : null}

        {/* Settings Navigation Item Placed Below Daily Limit */}
        <SettingsNavItem isCollapsed={isCollapsed} />
      </div>
    </aside>
  )
}
