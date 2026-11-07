import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getApiErrorInfo } from '@/lib/api-error'
import { toCamelCase, toSnakeCase } from '@/lib/case-transform'
import { env } from '@/config/env'

declare module 'axios' {
    interface AxiosRequestConfig {
        /**
         * A request to the API's auth routes: no bearer token, and a 401 from
         * it is an answer (a wrong password, a used-up cookie), not a sign that
         * the session ended. See src/features/auth/api/auth.api.ts.
         */
        skipAuth?: boolean
        /** Set on the one retry after a refresh, so a request is never retried twice. */
        authRetried?: boolean
    }
}

/**
 * No default Content-Type: axios sets `application/json` for plain objects on
 * its own, and leaves it unset for FormData so the browser can add the
 * multipart boundary.
 */
const api = axios.create({
    baseURL: env.VITE_API_URL
})

/**
 * What the client needs from whoever owns the session: the auth feature's
 * apiSession, connected once by main.tsx. Shared code imports no feature; until
 * a session is connected, requests simply go without a token.
 */
export interface ApiSession {
    isSignedIn(): boolean
    getToken(): Promise<string | undefined>
    /** A new access token, or undefined when the session is over (and signed out). */
    refreshToken(): Promise<string | undefined>
    /**
     * The session is over: `refused`, a 401 a refresh could not fix (the
     * error's `data.reason` says why), or `account-disabled`, the account
     * was deleted.
     */
    ended(error: AxiosError, why: 'refused' | 'account-disabled'): void
    /**
     * The API refused a request because the account has not done the
     * "complete your account" step (403 ACCOUNT_INCOMPLETE, D-61): the session
     * is fine, the app must open that step instead.
     */
    accountIncomplete(): void
}

let session: ApiSession | undefined

export function connectApiSession(next: ApiSession): void {
    session = next
}

/**
 * A refusal the shared refresh cookie may fix: the token aged, or its session
 * ended while this browser started a newer one (D-74).
 */
const REFRESHABLE = new Set(['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_REVOKED'])

// Request: auth token + camelCase -> snake_case
api.interceptors.request.use(async (config) => {
    // A retry after a refresh already carries the token that refresh returned.
    if (!config.skipAuth && !config.authRetried) {
        const token = await session?.getToken()
        if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // The backend's global pipe camelCases body, query and route params alike,
    // so query params go out in snake_case too. Non-JSON bodies (FormData,
    // Blob, strings) pass through unchanged.
    config.data = toSnakeCase(config.data)
    config.params = toSnakeCase(config.params)

    // Idempotency-Key is deliberately NOT set here. An interceptor runs once
    // per HTTP attempt, so a key minted here differs on every retry and the
    // server can never recognise a repeat. Keys belong to the user's intent —
    // see useIdempotentMutation.

    return config
})

// Response: snake_case -> camelCase, for success and error envelopes alike
api.interceptors.response.use(
    (response) => {
        response.data = toCamelCase(response.data)
        return response
    },
    async (error: AxiosError) => {
        if (!error.response) return Promise.reject(error)
        error.response.data = toCamelCase(error.response.data)

        const config = error.config as InternalAxiosRequestConfig | undefined
        const current = session
        if (config?.skipAuth || !current?.isSignedIn()) return Promise.reject(error)

        const { status, meta } = getApiErrorInfo(error)

        // An expired or unreadable access token: get a new one and try once
        // more. The session is fine; only the token aged (a laptop woken from
        // sleep, a clock that drifted, JWT_SECRET rotated on the API). A
        // revoked one too: another tab may have reset the password with a code
        // (D-74), which ended this session and left a newer one in the shared
        // cookie. Elsewhere the refresh is refused and says why it ended.
        if (status === 401 && meta && REFRESHABLE.has(meta.type) && config && !config.authRetried) {
            let token: string | undefined
            try {
                token = await current.refreshToken()
            } catch {
                // The API could not be asked. That says nothing about the
                // session: fail this request, keep the user signed in.
                return Promise.reject(error)
            }
            if (!token) {
                // The session is over, and refreshToken has signed out with the
                // reason the refresh gave.
                return Promise.reject(error)
            }
            config.authRetried = true
            config.headers.Authorization = `Bearer ${token}`
            return api(config)
        }

        // End the session only when the session itself is the problem:
        //   401                        — refused, and a refresh could not fix it
        //   403 AUTH_ACCOUNT_DISABLED  — the account was deleted
        // Any other 403 means "you may not do this", which the caller
        // should surface; logging out for it throws away the session and
        // whatever the user was doing. One of them is not the caller's to
        // handle: ACCOUNT_INCOMPLETE says the whole app is closed until the
        // "complete your account" step is done, wherever it was asked.
        if (status === 401) current.ended(error, 'refused')
        else if (status === 403 && meta?.type === 'AUTH_ACCOUNT_DISABLED') current.ended(error, 'account-disabled')
        else if (status === 403 && meta?.type === 'ACCOUNT_INCOMPLETE') current.accountIncomplete()

        return Promise.reject(error)
    }
)

export default api
