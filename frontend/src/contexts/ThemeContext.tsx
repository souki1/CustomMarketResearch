import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  readStoredUiTheme,
  UI_THEME_STORAGE_KEY,
  type UiThemeId,
} from '@/lib/uiTheme'

type ThemeContextValue = {
  theme: UiThemeId
  setTheme: (t: UiThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiThemeId>(() => readStoredUiTheme())

  const setTheme = useCallback((t: UiThemeId) => {
    setThemeState(t)
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
