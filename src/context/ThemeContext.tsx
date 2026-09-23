import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useCallback,
} from "react"

export type Theme = "dark" | "light"

interface ThemeContextType {
  theme: Theme

  setTheme: (theme: Theme) => void

  toggleTheme: () => void
}

const THEME_KEY = "audin_theme"

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}

/** Applies the theme class to <html>. Called pre-hydration too (index.html). */

export function applyThemeClass(theme: Theme) {
  const root = document.documentElement

  root.classList.add(theme)

  root.classList.remove(theme === "dark" ? "light" : "dark")
}

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null

    if (saved === "light" || saved === "dark") return saved
  } catch {
    /* ignore */
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    applyThemeClass(theme)

    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* non-fatal */
    }
  }, [theme])

  // Follow OS preference changes while the user has no explicit choice saved.

  useEffect(() => {
    let hasExplicit = false

    try {
      hasExplicit = !!localStorage.getItem(THEME_KEY)
    } catch {
      /* ignore */
    }

    if (hasExplicit) return

    const media = window.matchMedia("(prefers-color-scheme: light)")

    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "light" : "dark")
    }

    media.addEventListener("change", onChange)

    return () => media.removeEventListener("change", onChange)
  }, [])

  // Keep multiple open tabs in sync.

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === THEME_KEY &&
        (e.newValue === "light" || e.newValue === "dark")
      ) {
        setThemeState(e.newValue)
      }
    }

    window.addEventListener("storage", onStorage)

    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setTheme = useCallback((newTheme: Theme) => setThemeState(newTheme), [])

  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),

    [],
  )

  // Stable provider value prevents app-wide re-renders on unrelated updates.

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),

    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
