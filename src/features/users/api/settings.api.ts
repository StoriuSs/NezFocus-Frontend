import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { SettingsChanges, UserSettings } from '@/features/users/types'
import { userKeys } from './keys'

/*
 * The account's settings, apart from users.api.ts: that module is in the
 * first download (the auth store loads the profile), these are not. Only the
 * AppShell and the settings pages, both lazy, import this file.
 */

/** GET /users/me/settings: theme, language, time zone, switches (SRS 7.1). */
export async function fetchSettings(): Promise<UserSettings> {
    const response = await api.get<ApiEnvelope<UserSettings>>('/users/me/settings')
    return response.data.data
}

/**
 * The settings query. Loaded by the AppShell as the app opens, so pages never
 * wait for it; kept fresh by every save and by the other tabs (settings-sync.ts).
 */
export const settingsQuery = {
    queryKey: userKeys.settings(),
    queryFn: fetchSettings,
    staleTime: 60_000 // 1 minute
}

/**
 * PATCH /users/me/settings with only what changed. A second time zone change
 * within 24 hours is refused (429, `data.reason = "timezone"`).
 */
export async function updateSettings(changes: SettingsChanges): Promise<UserSettings> {
    const response = await api.patch<ApiEnvelope<UserSettings>>('/users/me/settings', changes)
    return response.data.data
}
