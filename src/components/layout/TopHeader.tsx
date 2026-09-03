import { Link } from "react-router-dom"
import Logo from "./Logo"
import UserDropdown from "./UserDropdown"
import { GearSix, List } from "@phosphor-icons/react"
import { useLanguage } from "../../context/LanguageContext"

import { useAuth } from "../../context/AuthContext"

interface TopHeaderProps {
  onOpenMobileNav?: () => void
}

export default function TopHeader({ onOpenMobileNav }: TopHeaderProps) {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuth()

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border bg-surface sticky top-0 z-30 print:hidden">
      <Link to="/" aria-label={t("app_name")}>
        <Logo />
      </Link>

      <div className="flex items-center gap-2 ml-auto">
        <UserDropdown compact />

        {!isAuthenticated && (
          <Link
            to="/settings"
            className="p-2 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
            title={t("nav_settings")}
            aria-label={t("nav_settings")}
          >
            <GearSix size={16} weight="duotone" />
          </Link>
        )}

        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            className="md:hidden p-2 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
            aria-label="Open Navigation"
          >
            <List size={18} weight="bold" />
          </button>
        )}
      </div>
    </header>
  )
}
