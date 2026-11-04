import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
    // so its insides stay free to move (docs/project-structure.md). Add a new
    // feature's folder name to this list.
    ...['auth', 'users'].map((self) => ({
        files: [`src/features/${self}/**/*.{ts,tsx}`],
        ignores: [`src/features/${self}/**/__tests__/**`],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: ['auth', 'users']
                        .filter((other) => other !== self)
                        .map((other) => ({
                            group: [`@/features/${other}/*`],
                            message: `Import from '@/features/${other}' (its index.ts), or add what you need there.`
                        }))
                }
            ]
        }
    })),
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
