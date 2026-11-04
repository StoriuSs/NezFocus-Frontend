import { z } from 'zod'

/**
 * Every VITE_* variable the app reads.
 *
 * Checked three times, because the values arrive at different moments:
 * `vite dev` refuses to start without them (see vite.config.ts); in
 * production, deploy.sh checks the required ones on the server
 * before it changes anything; and the container's entrypoint checks them
 * again at start, which for the addresses is the first time anything has seen
 * them — they are written into /config.js rather than inlined into the
 * bundle, so one image runs in any environment (docs/environment.md).
 *
 * The code used to fall back to hard-coded defaults that matched no real setup
 * (an API on :3000): a production build with a missing variable succeeded and
 * shipped a bundle pointing at localhost.
 */
export const envSchema = z.object({
    /**
     * Backend API base, including the version prefix: https://api.example.com/api/v1
     * A trailing slash is dropped: the Google button builds its link as
     * `${VITE_API_URL}/auth/google`, and a double slash there is a 404.
     */
    VITE_API_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, '')),
    /**
     * Error tracking (docs/error-tracking.md): a Sentry project's DSN. Unset or
     * empty: off, and the browser never downloads the SDK.
     */
    VITE_SENTRY_DSN: z
        .url({ protocol: /^https?$/ })
        .regex(/^https?:\/\/[^@/\s]+@[^/\s]+\/\S+$/, 'Not a DSN: expected https://<key>@<host>/<project>')
        .refine((dsn) => !/your[-_]/i.test(dsn), 'Still the placeholder from .env.example')
        .optional(),
    /**
     * The release errors are filed under: the commit deploy.sh is deploying
     * (APP_TAG), given to the container at start (and to the build, for the
     * sourcemap upload). Not set in the env file.
     */
    VITE_SENTRY_RELEASE: z.string().min(1).optional()
})

export type AppEnv = z.infer<typeof envSchema>

/**
 * Empty values count as unset. docker-compose.prod.yaml passes the optional
 * VITE_* settings as `${NAME:-}`, so one that isn't set arrives as "" —
 * which an `.optional()` URL would otherwise reject, and a required one would
 * report as "invalid" rather than missing.
 */
export function withoutEmptyValues(source: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''))
}

/** Human-readable problems, one per line, or null when the env is valid. */
export function describeEnvProblems(source: Record<string, unknown>): string | null {
    const result = envSchema.safeParse(withoutEmptyValues(source))
    if (result.success) return null
    return result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
}
