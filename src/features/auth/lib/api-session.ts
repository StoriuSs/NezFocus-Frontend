import type { ApiSession } from '@/lib/api'
import { useAuthStore } from '../auth.store'
import { signOutReasonOf } from './sign-out-reason'

/**
 * The auth store, as the API client sees it (src/lib/api.ts). main.tsx
 * connects the two, so the client in src/lib never imports a feature.
 */
export const apiSession: ApiSession = {
    isSignedIn: () => useAuthStore.getState().isAuthenticated,
    getToken: () => useAuthStore.getState().getToken(),
    refreshToken: () => useAuthStore.getState().refreshToken(),
    ended: (error, why) =>
        useAuthStore.getState().logout(why === 'account-disabled' ? 'account-disabled' : signOutReasonOf(error))
}
