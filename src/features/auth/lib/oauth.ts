import { env } from '@/config/env'

/**
 * Signing in with another provider (Google) is a page navigation, not an API
 * call: the browser goes to the API, the API sends it on to Google, and Google
 * sends it back to the API, which signs in and redirects to /auth/callback
 * (the API starter's docs/auth/google-sign-in.md).
 */

/** Providers this app has a button for, in the order they are shown. */
export const OAUTH_PROVIDERS = ['google'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

/** Where a "Continue with …" button goes: `redirect` is where to come back to afterwards. */
export function oauthStartUrl(provider: OAuthProvider, redirect?: string | null): string {
    const query = redirect ? `?${new URLSearchParams({ redirect })}` : ''
    return `${env.VITE_API_URL}/auth/${provider}${query}`
}

/** Why a sign-in with a provider did not work, as the API's redirect names it. */
export type OAuthFailure = 'cancelled' | 'failed' | 'email_unverified' | 'account_deleted'

export function oauthFailure(value: string | null): OAuthFailure | null {
    if (value === null) return null
    return value === 'cancelled' || value === 'email_unverified' || value === 'account_deleted' ? value : 'failed'
}
