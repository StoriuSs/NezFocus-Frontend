import i18n from '@/i18n'

/** Which kind of limit the API says refused a request (its rate-limits.ts). */
export type RateLimitReason = 'network' | 'recent_email' | 'emails' | 'sign_ins' | 'wrong_password' | 'codes'

/**
 * "42 seconds", "15 minutes", "2 hours": how long a limit asks to wait (C-22 ›
 * FormMessage, the one definition). Under 90 seconds, to the second; then
 * minutes, rounded up; from an hour, hours, rounded up.
 */
export function formatWait(seconds: number): string {
    if (seconds < 90) return i18n.t('auth:wait.seconds', { count: Math.max(1, Math.ceil(seconds)) })
    if (seconds < 3600) return i18n.t('auth:wait.minutes', { count: Math.ceil(seconds / 60) })
    return i18n.t('auth:wait.hours', { count: Math.ceil(seconds / 3600) })
}
