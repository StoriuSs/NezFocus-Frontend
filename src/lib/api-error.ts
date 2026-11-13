import axios from 'axios'
import i18n, { resources } from '@/i18n'

/** A key in the api translation namespace. */
export type ApiMessageKey = `api:${keyof (typeof resources)['en']['api']}`

/**
 * Error envelope sent by the backend, after the response interceptor has
 * camelCased it:
 *
 *   { meta: { code, type, message, requestId, ... }, data: { details, path, ... } }
 *
 * The human-readable message lives in `meta.message` — not at the top level.
 */
export interface ApiErrorMeta {
    code: string
    type: string
    message: string
    requestId?: string
}

export interface ApiErrorInfo {
    /** HTTP status, or `undefined` when no response arrived (network error, CORS, abort). */
    status?: number
    /** Backend error identity, when the response carried the standard envelope. */
    meta?: ApiErrorMeta
}

/** Client-side type for requests that never got a response. */
export const NETWORK_ERROR = 'NETWORK_ERROR'

export function getApiErrorInfo(error: unknown): ApiErrorInfo {
    if (!axios.isAxiosError(error)) return {}

    const status = error.response?.status
    const meta = (error.response?.data as { meta?: Partial<ApiErrorMeta> } | undefined)?.meta

    if (meta && typeof meta.type === 'string' && typeof meta.code === 'string') {
        return { status, meta: meta as ApiErrorMeta }
    }
    return { status }
}

/**
 * How long a limit asks to wait (`Retry-After` of a 429), in whole seconds;
 * none when the answer is not a 429 or carries no usable wait.
 */
export function retryAfterSeconds(error: unknown): number | undefined {
    if (!axios.isAxiosError(error) || error.response?.status !== 429) return undefined
    const seconds = Number(error.response.headers?.['retry-after'])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

/** The backend's `meta.type` (e.g. `USERNAME_CONFLICT`), `NETWORK_ERROR`, or `undefined`. */
export function getApiErrorType(error: unknown): string | undefined {
    if (axios.isAxiosError(error) && !error.response) return NETWORK_ERROR
    return getApiErrorInfo(error).meta?.type
}

/**
 * A localised, user-facing message for a failed request.
 *
 * Looks up `api:<meta.type>` in the translation catalogue, so every backend
 * error type with an entry renders in the user's language. The server's
 * `meta.message` is English and written for developers, so it is not shown;
 * types without an entry fall back to `fallbackKey`.
 */
export function getApiErrorMessage(error: unknown, fallbackKey: ApiMessageKey = 'api:GENERIC_ERROR'): string {
    const type = getApiErrorType(error)
    const key = `api:${type}`
    // The type comes from the server, so whether it is catalogued is only
    // known at runtime.
    if (type && i18n.exists(key)) {
        return i18n.t(key as ApiMessageKey)
    }
    return i18n.t(fallbackKey)
}
