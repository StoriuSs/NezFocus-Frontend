import { envSchema, describeEnvProblems, withoutEmptyValues } from './env.schema'

declare global {
    interface Window {
        /** See below; set by /config.js, which index.html loads first. */
        __APP_CONFIG__?: Record<string, unknown>
    }
}

/**
 * This deployment's settings.
 *
 * In production they come from `/config.js`, which the container writes at
 * start from its environment (nginx/40-runtime-config.sh): the bundle holds no
 * addresses, so one image runs in any environment and CI needs no
 * per-environment settings to publish it.
 *
 * In development that file is the empty one in `public/`, and the values are
 * the VITE_* ones Vite inlines from `.env.development`. Production wins where
 * both exist, and an empty runtime value counts as unset rather than
 * overwriting a real one.
 */
const runtime = typeof window === 'undefined' ? {} : (window.__APP_CONFIG__ ?? {})
const source = { ...import.meta.env, ...withoutEmptyValues(runtime) }

const problems = describeEnvProblems(source)
if (problems) {
    // In production this means the container started without its settings,
    // which its own check should have refused; in development, a missing
    // .env.development.
    throw new Error(`Invalid environment configuration:\n${problems}`)
}

/** Validated, typed configuration. Import this, not `import.meta.env`. */
export const env = envSchema.parse(withoutEmptyValues(source))
