import { useQuery } from '@tanstack/react-query'
import { settingsQuery } from './settings.api'

/** The account's settings, inside the users feature. Another feature reads the cache: `useQuery(settingsCache)`. */
export function useSettings() {
    return useQuery(settingsQuery)
}
