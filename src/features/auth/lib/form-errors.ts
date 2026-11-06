import axios from 'axios'
import i18n from '@/i18n'
import { getApiErrorInfo, getApiErrorMessage } from '@/lib/api-error'
import { rejectedRules, type PasswordRule } from './password-rules'

/** Which kind of limit the API says refused a request (its rate-limits.ts). */
export type RateLimitReason = 'network' | 'emails' | 'sign_ins' | 'wrong_password' | 'codes'

const RATE_LIMIT_REASONS = new Set<string>(['network', 'emails', 'sign_ins', 'wrong_password', 'codes'])

/**
 * What a failed auth request means for the form that sent it.
 *
 * `message` is for the whole form; `passwordRules` are the rules the API
 * refused a new password for, shown on the password's checklist instead.
 */
export interface AuthFormError {
    type?: string
    message: string
    passwordRules: PasswordRule[]
    /**
     * A limit refused (429): seconds until it may be tried again, from
     * Retry-After, for keeping the button disabled that long.
     */
    retryAfterSeconds?: number
    /** Which kind of limit refused; `message` says it in words. */
    rateLimitReason?: RateLimitReason
}

/** The error's `data`: where the API puts details (camelCased by src/lib/api.ts). */
function detailsOf(error: unknown): Record<string, unknown> {
    if (!axios.isAxiosError(error)) return {}
    const data = (error.response?.data as { data?: unknown } | undefined)?.data
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
}

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

export function authFormError(error: unknown): AuthFormError {
    const { status, meta } = getApiErrorInfo(error)
    const type = meta?.type
    const details = detailsOf(error)
    const plain = { type, passwordRules: [] }

    if (status === 429) {
        const header = axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined
        const seconds = Number(header)
        const reason =
            typeof details.reason === 'string' && RATE_LIMIT_REASONS.has(details.reason)
                ? (details.reason as RateLimitReason)
                : undefined
        if (!(Number.isFinite(seconds) && seconds > 0)) {
            return { ...plain, message: getApiErrorMessage(error), rateLimitReason: reason }
        }
        const wait = formatWait(seconds)
        return {
            ...plain,
            message: reason ? i18n.t(`auth:tooMany.${reason}`, { wait }) : i18n.t('auth:tooManyAttempts', { wait }),
            retryAfterSeconds: Math.ceil(seconds),
            rateLimitReason: reason
        }
    }

    if (type === 'AUTH_PASSWORD_REJECTED') {
        return { ...plain, message: getApiErrorMessage(error), passwordRules: rejectedRules(details.rules) }
    }

    return { ...plain, message: getApiErrorMessage(error) }
}
