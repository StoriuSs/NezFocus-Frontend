import type { ApiSession } from '@/lib/api'
import { useAuthStore } from '../auth.store'
import { deletesAtOf, signOutReasonOf } from './sign-out-reason'

/**
 * The auth store, as the API client sees it (src/lib/api.ts). main.tsx
 * connects the two, so the client in src/lib never imports a feature.
 */
export const apiSession: ApiSession = {
    isSignedIn: () => useAuthStore.getState().isAuthenticated,
    getToken: () => useAuthStore.getState().getToken(),
    refreshToken: () => useAuthStore.getState().refreshToken(),
    // With an account waiting to be deleted, the date this refusal gives for the banner.
    ended: (error, why) =>
        why === 'account-disabled'
            ? useAuthStore.getState().logout('account-disabled')
            : useAuthStore.getState().logout(signOutReasonOf(error), undefined, deletesAtOf(error)),
    // The routes see the store change and open /welcome (ProtectedRoute).
    accountIncomplete: () => useAuthStore.getState().markIncomplete(),
    // The routes see it too and open sign in, where the restore dialog shows.
    pendingDeletion: (deletesAt) => useAuthStore.getState().markPendingDeletion(deletesAt)
}
