import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useCallback,
} from "react"

import { Language, translations } from "../i18n/translations"

type TranslationKey = keyof typeof translations.en

interface LanguageContextType {
  language: Language

  setLanguage: (lang: Language) => void

  toggleLanguage: () => void

  t: (key: TranslationKey, vars?: Record<string, string>) => string
}

const LANGUAGE_KEY = "audin_language"

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
)

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }

  return context
}

function readInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY) as Language | null

    if (saved === "en" || saved === "id") return saved
  } catch {
    /* ignore */
  }

  const browserLang = navigator.language?.toLowerCase()

  return browserLang.startsWith("id") ? "id" : "en"
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage)

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language)
    } catch {
      /* non-fatal */
    }

    // Keep <html lang> in sync so screen readers use correct pronunciation.

    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback(
    (lang: Language) => setLanguageState(lang),
    [],
  )

  const toggleLanguage = useCallback(
    () => setLanguageState((prev) => (prev === "en" ? "id" : "en")),

    [],
  )

  /**
   * Translate with optional {var} interpolation:
   *   t("toast_deleted", { name: "Meeting.mp3" })
   */

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string>): string => {
      const dict = translations[language] || translations.en

      let text: string = (dict as Record<string, string>)[key] || String(key)

      if (vars) {
        for (const [name, val] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${name}\\}`, "g"), val)
        }
      }

      return text
    },

    [language],
  )

  // Stable provider value prevents app-wide re-renders on unrelated updates.

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),

    [language, setLanguage, toggleLanguage, t],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}
