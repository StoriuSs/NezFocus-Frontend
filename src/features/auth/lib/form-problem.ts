import axios from 'axios'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { getApiErrorInfo, getApiErrorType, NETWORK_ERROR, retryAfterSeconds } from '@/lib/api-error'
import type { RateLimitReason } from './form-errors'
import { rejectedRules, type PasswordRule } from './password-rules'

/**
 * Text to show, kept as a key and its values rather than as words: it is put
 * into words when shown, so switching the language at the foot of the page
 * changes a message already on screen (M0 L8; before, an error stayed in the
 * language it arrived in).
 */
export interface Message {
    /** A key with its namespace: `auth:…`, `api:…`. */
    key: string
    values?: Record<string, string | number>
}

/** What a failed request means for the form that sent it. */
export interface RequestFailure {
    /** The API's error type, when it gave one. */
    type?: string
    /**
     * A limit refused (429 with Retry-After): when it may be tried again, and
     * which limit. The page words it, since the same limit reads differently
     * on each page (01-auth.md).
     */
    limit?: { reason?: RateLimitReason; until: number }
    /** The rules the API refused a new password for (AUTH_PASSWORD_REJECTED). */
    passwordRules: PasswordRule[]
    /** No answer arrived: the device is offline, or the API cannot be reached. */
    offline: boolean
    /** What to say when nothing more specific applies. */
    message: Message
}

const RATE_LIMIT_REASONS = new Set<string>(['network', 'recent_email', 'emails', 'sign_ins', 'wrong_password', 'codes'])

/** The error's `data`: where the API puts details (camelCased by src/lib/api.ts). */
function detailsOf(error: unknown): Record<string, unknown> {
    if (!axios.isAxiosError(error)) return {}
    const data = (error.response?.data as { data?: unknown } | undefined)?.data
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
}

export function requestFailure(error: unknown, now = Date.now()): RequestFailure {
    const { status, meta } = getApiErrorInfo(error)
    const type = meta?.type
    const details = detailsOf(error)
    const failure: RequestFailure = { type, passwordRules: [], offline: false, message: { key: 'api:GENERIC_ERROR' } }

    if (getApiErrorType(error) === NETWORK_ERROR) {
        return { ...failure, offline: true, message: { key: 'auth:problems.offline' } }
    }
    if (status !== undefined && status >= 500) return { ...failure, message: { key: 'auth:problems.server' } }

    if (status === 429) {
        const seconds = retryAfterSeconds(error)
        const reason =
            typeof details.reason === 'string' && RATE_LIMIT_REASONS.has(details.reason)
                ? (details.reason as RateLimitReason)
                : undefined
        if (seconds) {
            return { ...failure, limit: { reason, until: now + Math.ceil(seconds) * 1000 } }
        }
        return { ...failure, message: { key: 'api:RATE_LIMIT_EXCEEDED' } }
    }

    if (type === 'AUTH_PASSWORD_REJECTED') failure.passwordRules = rejectedRules(details.rules)
    if (type && i18n.exists(`api:${type}`)) failure.message = { key: `api:${type}` }
    return failure
}

type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * Puts a Message into words, in the language on screen. The component
 * re-renders when the language changes, so the words follow it.
 */
export function useMessageText(): (message: Message) => string {
    const { t } = useTranslation()
    // Keys arrive at runtime (from the API's error types), so they cannot be
    // checked against the catalogue at compile time; catalogues.test.ts and
    // the tests of each page check the ones used.
    const translate = t as unknown as Translate
    return (message) => translate(message.key, message.values)
}
