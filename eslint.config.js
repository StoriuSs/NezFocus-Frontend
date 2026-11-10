import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { readdirSync } from 'node:fs'

// Every folder under src/features is a feature, so a new one is held by the
// boundary rule below from its first file (CONSTRAINTS.md, architecture).
const FEATURES = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

/** Another feature only through its index.ts (docs/project-structure.md). */
const otherFeatures = (self) =>
    FEATURES.filter((other) => other !== self).map((other) => ({
        group: [`@/features/${other}/*`],
        message: `Import from '@/features/${other}' (its index.ts), or add what you need there.`
    }))

// A key made next to the request is a new key on every click, so "Create"
// again after a lost answer makes the thing twice (M1 › R1). Features get
// theirs from a hook built on useIdempotentMutation.
const IDEMPOTENCY_KEY_BAN = {
    group: ['@/lib/idempotency'],
    message:
        'Send the request from a hook built on useIdempotentMutation, which keeps one key per intent (docs/data-fetching.md › Mutations and idempotency).'
}

export default defineConfig([
    globalIgnores(['dist', 'coverage', '.agents', 'playwright-report', 'test-results', 'src/lib/api-schema.d.ts']),
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
            // Accessibility rules would have flagged the avatar picker that was
            // a click handler on a <span>, and links wrapped around buttons.
            jsxA11y.flatConfigs.recommended
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
            // Type information, for the rules below that need it.
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            // A promise nobody awaits or catches fails silently. Mark
            // deliberate fire-and-forget calls with `void`.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
            // <RequireRole role='admin'> is a component prop, not an ARIA role.
            'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
            'react-refresh/only-export-components': 'off',
            'react-hooks/set-state-in-effect': 'off'
        }
    },
    // Shared code knows no feature: the API client gets the session through
    // connectApiSession (main.tsx), not by importing the auth store.
    {
        files: ['src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
        ignores: ['**/__tests__/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@/features/*', '@/features/**'],
                            message: 'Shared code imports no feature. Pass in what it needs (see connectApiSession).'
                        }
                    ]
                }
            ]
        }
    },
    // Pages outside a feature use one only through its index.ts, like another
    // feature would. src/app is exempt: it wires the features into the app.
    {
        files: ['src/pages/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@/features/*/*'],
                            message:
                                "Import from the feature's index.ts ('@/features/auth'), or add what you need there."
                        }
                    ]
                }
            ]
        }
    },
    // A feature uses another only through its index.ts (`@/features/users`),
    // so its insides stay free to move (docs/project-structure.md). The
    // features are FEATURES, read from src/features at the top of this file.
    // Nor does a feature make Idempotency-Key values itself (IDEMPOTENCY_KEY_BAN).
    ...FEATURES.map((self) => ({
        files: [`src/features/${self}/**/*.{ts,tsx}`],
        ignores: [`src/features/${self}/**/__tests__/**`],
        rules: {
            'no-restricted-imports': ['error', { patterns: [...otherFeatures(self), IDEMPOTENCY_KEY_BAN] }]
        }
    })),
    // The one exception (CONSTRAINTS.md › Ngoại lệ E1): "Try again" on a new
    // server's picture runs from a toast after the dialog has closed, so the
    // key travels with the retry (useCreateServer.ts › saveNewServerIcon).
    {
        files: ['src/features/servers/api/useCreateServer.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: otherFeatures('servers') }] }
    },
    {
        files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
        rules: { '@typescript-eslint/no-misused-promises': 'off' }
    },
    {
        // Config files run in Node, not the browser.
        files: ['*.config.ts', 'e2e/**/*.ts'],
        languageOptions: { globals: globals.node }
    },
    {
        // The k6 load-test script. An ES module that runs in k6's own
        // JavaScript runtime rather than in Node or a browser: it imports from
        // k6's built-in modules (which have no node_modules entry) and reads
        // the environment through a global k6 provides.
        files: ['k6/**/*.js'],
        extends: [js.configs.recommended],
        languageOptions: {
            sourceType: 'module',
            globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', open: 'readonly' }
        }
    }
])
