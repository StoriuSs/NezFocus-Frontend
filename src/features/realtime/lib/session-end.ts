import { useAuthStore } from '@/features/auth'

/**
 * The API ended this tab's session (signed out elsewhere, password changed,
 * the account deleted...). A refresh asks why: when the session is really
 * over it signs out with that reason, as a refused request would, and the
 * sign-in page's banner says it. When another tab left a new session in the
 * shared cookie (D-74), the refresh succeeds and the person is still signed
 * in: the socket connects again. Rejects when the API could not be asked.
 */
export async function endSession(): Promise<boolean> {
    const auth = useAuthStore.getState()
    if (!auth.isAuthenticated) return false
    return (await auth.refreshToken()) !== undefined
}
