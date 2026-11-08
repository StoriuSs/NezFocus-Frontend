import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useTheme } from '@/hooks/useTheme'
import { useSettings } from '../api/useSettings'
import { userKeys } from '../api/keys'
import { onOtherTabSettings } from '../lib/settings-sync'

/**
 * Keeps this tab on the account's theme and language (REQ-AUTH-08, D-37):
 * as the app opens (so a choice made in another browser shows here), when a
 * settings page changes them, and when another tab saves them. Both are also
 * kept in this browser, for the pages outside the app and the next load
 * (index.html sets the theme before React starts). Mounted once, by the AppShell.
 */
export function useAccountSettings(): void {
    const queryClient = useQueryClient()
    const { setTheme } = useTheme()
    const { data } = useSettings()
    const theme = data?.theme
    const language = data?.language

    useEffect(() => {
        if (theme) setTheme(theme)
    }, [theme, setTheme])

    useEffect(() => {
        if (language && i18n.resolvedLanguage !== language) void i18n.changeLanguage(language)
    }, [language])

    useEffect(
        () => onOtherTabSettings((settings) => queryClient.setQueryData(userKeys.settings(), settings)),
        [queryClient]
    )
}
