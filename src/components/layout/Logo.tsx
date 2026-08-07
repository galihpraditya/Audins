export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/icon.png"
        alt="Audin Logo"
        className="w-14 h-14 object-contain flex-shrink-0"
      />
      <div>
        <p className="text-sm font-semibold leading-none font-display text-fg">Audin</p>
        <p className="text-xs mt-0.5 text-fg-tertiary">Audio Intelligence</p>
      </div>
    </div>
  )
}
