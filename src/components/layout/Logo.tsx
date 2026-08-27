interface LogoProps {
  isCollapsed?: boolean
  className?: string
}

export default function Logo({ isCollapsed = false, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2.5"} ${className}`}>
      {/* Audio Emblem — full, prominent waveform matching favicon.svg */}
      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
        <svg
          viewBox="0 0 32 32"
          className="w-6 h-6 text-primary-contrast"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16 4v24M10.5 8v16M5 12v8M21.5 8v16M27 12v8"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {!isCollapsed && (
        <div className="min-w-0">
          <span className="text-base font-bold font-display tracking-tight text-fg leading-none block">
            Audins
          </span>
        </div>
      )}
    </div>
  )
}
