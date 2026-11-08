import { useQuery } from '@tanstack/react-query'
import { settingsQuery } from './settings.api'

/** The account's settings, inside the users feature. Another feature reads the cache: `useQuery({ queryKey: userKeys.settings(), enabled: false })`. */
export function useSettings() {
    return useQuery(settingsQuery)
}
