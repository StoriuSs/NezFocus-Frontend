import { z } from 'zod'

/**
 * Zod 4 checks whether it may compile parsers with `new Function`. The
 * production Content-Security-Policy forbids that (no 'unsafe-eval'), so the
 * check always fails, and each failure is reported as a CSP violation on every
 * page load, burying real ones. `jitless` skips the check; the interpreted
 * parsers are plenty fast for forms and env validation.
 *
 * Imported before anything that parses (main.tsx).
 */
z.config({ jitless: true })
