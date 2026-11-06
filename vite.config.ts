import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import { describeEnvProblems } from './src/config/env.schema'
import { siteConfig } from './src/config/site'

/**
 * Refuses to start `vite dev` with missing or malformed VITE_* variables
 * (a production build takes its settings at container start instead; see
 * below).
 */
function validateEnv(): Plugin {
    return {
        name: 'validate-env',
        config(_config, { command, mode }) {
            // Only the dev server. A production build inlines no addresses any
            // more: the container writes them into /config.js at start, and
            // checks them there (nginx/40-runtime-config.sh). Requiring them
            // here would mean CI could not build an image without knowing the
            // environment it will run in.
            if (command !== 'serve') return
            // Same sources Vite uses: .env.<mode> files and process.env.
            const problems = describeEnvProblems(loadEnv(mode, process.cwd(), 'VITE_'))
            if (problems) {
                throw new Error(
                    `Missing or invalid environment variables for mode "${mode}":\n${problems}\n` +
                        'Set them in .env.' +
                        mode +
                        ' (copy .env.example).'
                )
            }
        }
    }
}

/** Writes the product name (src/config/site.ts) into index.html's <title>. */
function siteTitle(): Plugin {
    return {
        name: 'site-title',
        transformIndexHtml: (html) => html.replaceAll('%SITE_NAME%', siteConfig.name)
    }
}

/**
 * Libraries that change rarely, each in its own chunk. A deploy that only
 * touches app code then leaves these file names (and the browser's cached
 * copies) unchanged, instead of invalidating one 700 kB bundle every time.
 * Anything not listed stays where Rollup puts it, so a library used only by a
 * lazy page is still loaded only with that page.
 *
 * UI libraries (Radix, lucide-react, sonner) are deliberately not listed: as a
 * chunk of their own, every one any lazy page used was downloaded before the
 * first screen, and that chunk grew with each new page (M0, L4).
 */
const VENDOR_CHUNKS: Record<string, RegExp> = {
    react: /^(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router)$/,
    i18n: /^(i18next|react-i18next|i18next-.*)$/,
    query: /^(@tanstack\/.*|axios|zustand)$/
}

function vendorChunk(id: string): string | undefined {
    // The package is named after the LAST node_modules/ (pnpm nests them).
    const path = id.replaceAll('\\', '/')
    const at = path.lastIndexOf('/node_modules/')
    if (at === -1) return undefined
    const [first = '', second = ''] = path.slice(at + '/node_modules/'.length).split('/')
    const name = first.startsWith('@') ? `${first}/${second}` : first
    return Object.entries(VENDOR_CHUNKS).find(([, pattern]) => pattern.test(name))?.[0]
}

/**
 * Uploads the build's sourcemaps to Sentry, so reported stack traces show the
 * source instead of minified code (docs/error-tracking.md). Only when
 * SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set, which a normal
 * build doesn't need: without them the build has no sourcemaps at all.
 *
 * The maps are uploaded, then deleted, never served: `hidden` leaves no
 * sourceMappingURL comment in the bundle, and the Docker build removes any
 * .map file left behind. A failed upload warns and the build goes on: a deploy
 * doesn't wait for Sentry, and the release's stack traces stay minified.
 */
function sentrySourcemaps(env: NodeJS.ProcessEnv): Plugin[] {
    const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = env
    if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) return []
    return sentryVitePlugin({
        authToken: SENTRY_AUTH_TOKEN,
        org: SENTRY_ORG,
        project: SENTRY_PROJECT,
        // Same release name the app reports (VITE_SENTRY_RELEASE, the commit).
        release: { name: env.VITE_SENTRY_RELEASE || undefined, inject: false },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
        errorHandler: (error) => {
            console.warn(`
[sentry] Sourcemaps were NOT uploaded; this release's stack traces stay minified.
${error}
`)
        }
    })
}

const uploadsSourcemaps = sentrySourcemaps(process.env).length > 0

// https://vite.dev/config/
export default defineConfig({
    plugins: [validateEnv(), siteTitle(), react(), ...sentrySourcemaps(process.env)],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        sourcemap: uploadsSourcemaps ? 'hidden' : false,
        // Fonts stay files: inlined into the stylesheet as base64 (Vite does
        // that below 4 KB), a subset most pages never use would weigh on every
        // first screen, and unicode-range could no longer skip it.
        assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
        rollupOptions: {
            output: { manualChunks: vendorChunk }
        }
    },
    server: {
        port: 3001
    }
})
