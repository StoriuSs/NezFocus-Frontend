import { useEffect } from 'react'
import { create } from 'zustand'
import { safeLocalStorage } from '@/lib/safe-storage'

export type Theme = 'light' | 'dark' | 'system'

/** Read by the inline script in index.html too — keep the two in step. */
const STORAGE_KEY = 'theme'
const THEMES: readonly Theme[] = ['light', 'dark', 'system']

function readStoredTheme(): Theme {
    const stored = safeLocalStorage.get(STORAGE_KEY)
    return THEMES.includes(stored as Theme) ? (stored as Theme) : 'system'
}

const systemPrefersDark = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

function resolve(theme: Theme): 'light' | 'dark' {
    return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle('dark', resolve(theme) === 'dark')
}

interface ThemeState {
    theme: Theme
    /** What is on screen: `system` resolved to light or dark. */
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
}

/**
 * One theme for the whole app. It used to be local state inside the hook, so
 * each component calling useTheme had its own copy — the toaster never saw
 * the user's choice and stayed on `system`.
 */
export const useThemeStore = create<ThemeState>((set) => {
    const initial = typeof window === 'undefined' ? 'system' : readStoredTheme()
    return {
        theme: initial,
        resolvedTheme: resolve(initial),
        setTheme: (theme) => {
            safeLocalStorage.set(STORAGE_KEY, theme)
            applyTheme(theme)
            set({ theme, resolvedTheme: resolve(theme) })
        }
    }
})

/**
 * The current theme and a setter. Keeps the page in step with the OS setting
 * while the theme is `system`. The initial class is set before React loads,
 * by the script in index.html, so a dark-mode user never sees a white flash.
 */
export function useTheme() {
    const theme = useThemeStore((state) => state.theme)
    const setTheme = useThemeStore((state) => state.setTheme)

    useEffect(() => {
        applyTheme(theme)
        if (theme !== 'system') return

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => {
            applyTheme('system')
            useThemeStore.setState({ resolvedTheme: resolve('system') })
        }
        mediaQuery.addEventListener('change', handler)
        return () => mediaQuery.removeEventListener('change', handler)
    }, [theme])

    return { theme, setTheme }
}
