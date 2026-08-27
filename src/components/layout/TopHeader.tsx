import { Link } from "react-router-dom"
import Logo from "./Logo"
import { GearSix, List } from "@phosphor-icons/react"
import { useLanguage } from "../../context/LanguageContext"

interface TopHeaderProps {
  onOpenMobileNav?: () => void
}

export default function TopHeader({ onOpenMobileNav }: TopHeaderProps) {
  const { t } = useLanguage()

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border bg-surface sticky top-0 z-30 print:hidden">
      <Link to="/" aria-label={t("app_name")}>
        <Logo />
      </Link>

      <div className="flex items-center gap-1 ml-auto">
        <Link
          to="/settings"
          className="p-2 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
          title={t("nav_settings")}
          aria-label={t("nav_settings")}
        >
          <GearSix size={16} weight="duotone" />
        </Link>

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
