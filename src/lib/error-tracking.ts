import type * as Sentry from '@sentry/react'
import axios from 'axios'
import type { RootOptions } from 'react-dom/client'
import { isChunkLoadError } from '@/components/ErrorBoundary'
import { env } from '@/config/env'

/**
 * Error tracking (Sentry). See docs/error-tracking.md.
 *
 * On when this deployment has a DSN: VITE_SENTRY_DSN in the container's
 * environment, which reaches the page through /config.js (in development,
 * from .env.development). The SDK is its own chunk, loaded only then, so a
 * deployment without Sentry downloads none of it. main.tsx waits for it before
 * the first render, so errors in that render are reported too.
 */
type Sdk = typeof import('./error-sdk')
let sdk: Sdk | undefined

function dsn(): string | undefined {
    return env.VITE_SENTRY_DSN
}

export function isErrorTrackingEnabled(): boolean {
    return Boolean(dsn())
}

/**
 * Loads and starts the SDK, when there is a DSN. Call once, and render after
 * it settles. Never rejects: if the chunk can't load (a network blip, a
 * blocker), the app runs without error tracking.
 */
export async function initErrorTracking(): Promise<void> {
    const value = dsn()
    if (!value || sdk) return
    try {
        const loaded = await import('./error-sdk')
        loaded.init({
            dsn: value,
            environment: import.meta.env.MODE,
            release: env.VITE_SENTRY_RELEASE,
            // No IP address. The user is set as an id only (setErrorTrackingUser).
            sendDefaultPii: false,
            // Breadcrumbs only leave with an event, so this cleans them too.
            beforeSend: (event, hint) => (shouldSend(event, hint.originalException) ? scrubEvent(event) : null),
            // Browser noise that says nothing about this app.
            ignoreErrors: [/ResizeObserver loop/i],
            denyUrls: [/^(chrome|moz|safari(-web)?)-extension:\/\//i]
        })
        sdk = loaded
    } catch (error) {
        console.error('Error tracking is off: its script did not load.', error)
    }
}

/**
 * Handlers for React's root: errors caught by an error boundary (the page and
 * route boundaries), errors no boundary caught, and errors React recovered
 * from. Reported here, with the component stack, rather than in each
 * boundary. Empty until initErrorTracking has loaded the SDK.
 */
export function rootErrorHandlers(): RootOptions {
    if (!sdk) return {}
    // A handler replaces React's own console output for that kind of error.
    // The boundaries log what they catch themselves.
    const log = (error: unknown) => console.error(error)
    return {
        onCaughtError: sdk.reactErrorHandler(),
        onUncaughtError: sdk.reactErrorHandler(log),
        onRecoverableError: sdk.reactErrorHandler(log)
    }
}

/** The signed-in user, as their id only (the backend reports the same id). */
export function setErrorTrackingUser(id: string | undefined): void {
    sdk?.setUser(id ? { id } : null)
}

/**
 * Reports an error the app caught and carried on from, when it still needs a
 * person: a bug in a query function, say. Not API errors: the backend
 * reports its own failures, and 4xx and network errors aren't bugs.
 */
export function reportError(error: unknown, tags?: Record<string, string>): void {
    if (!sdk || isApiError(error)) return
    sdk.captureException(error, { tags })
}

export function isApiError(error: unknown): boolean {
    return axios.isAxiosError(error)
}

// ─── What is sent ────────────────────────────────────────────────────────────

/**
 * Per page load: each error sends a burst of events, then one more every few
 * minutes, and the page stops sending after a total. An error thrown in a
 * loop, in one open tab, can't spend the project's quota.
 */
export const EVENT_BURST = 5
export const EVENT_REFILL_MS = 5 * 60_000
export const MAX_EVENTS_PER_PAGE = 30
const MAX_TRACKED_ERRORS = 100

const buckets = new Map<string, { tokens: number; refilledAt: number }>()
let sentThisPage = 0

export function withinEventLimit(key: string, now = Date.now()): boolean {
    if (sentThisPage >= MAX_EVENTS_PER_PAGE) return false
    let bucket = buckets.get(key)
    if (bucket) {
        const due = Math.floor((now - bucket.refilledAt) / EVENT_REFILL_MS)
        if (due > 0) {
            bucket.tokens = Math.min(EVENT_BURST, bucket.tokens + due)
            bucket.refilledAt += due * EVENT_REFILL_MS
        }
    } else {
        if (buckets.size >= MAX_TRACKED_ERRORS) return false
        bucket = { tokens: EVENT_BURST, refilledAt: now }
        buckets.set(key, bucket)
    }
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    sentThisPage += 1
    return true
}

/** Whether an event goes out: not an expected failure, and within the limits. */
export function shouldSend(event: Sentry.ErrorEvent, originalException: unknown): boolean {
    // A tab opened before a deploy can't load the new chunks: not a bug, and
    // every open tab would report it. The error screen asks for a reload.
    if (originalException instanceof Error && isChunkLoadError(originalException)) return false
    // An unhandled rejected request: the backend reports its own failures.
    if (isApiError(originalException)) return false
    const values = event.exception?.values ?? []
    const exception = values[values.length - 1]
    const key = exception ? `${exception.type}: ${exception.value}` : (event.message ?? '')
    return withinEventLimit(key)
}

/** Object keys whose values are never sent. Compared without case, `-` or `_`. */
const SENSITIVE_KEYS = new Set(
    [
        'authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'idempotency-key',
        'password',
        'confirmPassword',
        'oldPassword',
        'newPassword',
        'currentPassword',
        'token',
        'accessToken',
        'refreshToken',
        'idToken',
        'secret'
    ].map(normaliseKey)
)

/**
 * Query parameters whose values are never sent: the above, plus what an
 * OAuth redirect carries (a social sign-in returns with them; a fragment, where
 * some providers put them, is dropped entirely).
 */
const SENSITIVE_PARAMS = new Set([...SENSITIVE_KEYS, ...['code', 'state', 'sessionState'].map(normaliseKey)])

function normaliseKey(key: string): string {
    return key.toLowerCase().replace(/[-_]/g, '')
}

export const REDACTED = '[REDACTED]'

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
    if (event.request) {
        const { request } = event
        if (request.url) request.url = redactUrl(request.url)
        request.headers = redactDeep(request.headers)
        if (request.cookies) request.cookies = {}
        if (typeof request.query_string === 'string') request.query_string = redactQuery(request.query_string)
        request.data = redactDeep(request.data)
    }
    event.extra = redactDeep(event.extra)
    event.contexts = redactDeep(event.contexts)
    event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
        ...breadcrumb,
        message: breadcrumb.message === undefined ? undefined : redactText(breadcrumb.message),
        data: redactDeep(breadcrumb.data)
    }))
    if (event.transaction) event.transaction = redactUrl(event.transaction)
    return event
}

const MAX_DEPTH = 10

/** A copy with sensitive keys' values replaced and URLs in strings cleaned. */
export function redactDeep<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
    if (typeof value === 'string') return redactText(value) as T
    if (value === null || typeof value !== 'object') return value
    if (seen.has(value) || depth >= MAX_DEPTH) return '[Truncated]' as T
    seen.add(value)
    const copy = Array.isArray(value)
        ? value.map((item) => redactDeep(item, depth + 1, seen))
        : Object.fromEntries(
              Object.entries(value).map(([key, item]) => [
                  key,
                  SENSITIVE_KEYS.has(normaliseKey(key)) ? REDACTED : redactDeep(item, depth + 1, seen)
              ])
          )
    seen.delete(value)
    return copy as T
}

/** Drops the fragment and redacts sensitive query parameters of one URL. */
export function redactUrl(url: string): string {
    const hash = url.indexOf('#')
    const withoutFragment = hash === -1 ? url : url.slice(0, hash)
    const index = withoutFragment.indexOf('?')
    if (index === -1) return withoutFragment
    return withoutFragment.slice(0, index + 1) + redactQuery(withoutFragment.slice(index + 1))
}

function redactQuery(query: string): string {
    const params = new URLSearchParams(query)
    let changed = false
    for (const key of new Set(params.keys())) {
        if (SENSITIVE_PARAMS.has(normaliseKey(key))) {
            params.set(key, REDACTED)
            changed = true
        }
    }
    return changed ? params.toString() : query
}

/** URLs inside free text: a breadcrumb's message, a navigation's `from` and `to`. */
export function redactText(text: string): string {
    if (!text.includes('?') && !text.includes('#')) return text
    return text.replace(/(?:https?:\/\/[^\s"'<>]*|\/[^\s"'<>]*[?#][^\s"'<>]*)/g, (url) => redactUrl(url))
}
