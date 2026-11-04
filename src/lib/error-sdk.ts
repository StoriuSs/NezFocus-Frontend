/**
 * The parts of the Sentry SDK the app uses, loaded on demand by
 * error-tracking.ts. Named imports, so the build keeps only these and what
 * they need: a dynamic import of '@sentry/react' itself would bring the whole
 * package (session replay, feedback widget...), several times the size. Not
 * named after Sentry: content blockers match "sentry" in script URLs.
 */
export { captureException, init, reactErrorHandler, setUser } from '@sentry/react'
