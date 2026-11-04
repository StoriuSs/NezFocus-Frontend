#!/usr/bin/env node
// lint-changed: ESLint over the files the change touches, inside what `pnpm lint`
// covers. Type-aware linting loads the TypeScript program either way, so the
// saving is in the rules run, and in the output staying about this change.
//
//   node scripts/constraints/lint-changed.mjs [--base <ref>]
//
// Exit 0 no errors, 1 lint errors, 2 the check could not run.
import { spawnSync } from 'node:child_process'
import { goToTop, readChange, resolveBase, touchedFiles } from './change.mjs'

const TOOL = 'lint-changed'
goToTop(TOOL)

// eslint.config.js lints every .ts/.tsx and the k6 script; its own ignores
// (dist, the generated API schema…) still apply.
const LINTED = /\.(ts|tsx)$|^k6\/.*\.js$/
const files = touchedFiles(readChange(TOOL, { base: resolveBase(TOOL) })).filter((f) => LINTED.test(f))
if (!files.length) {
    console.log(`${TOOL}: no linted files changed`)
    process.exit(0)
}

const run = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...files], {
    stdio: 'inherit'
})
if (run.status === null) process.exit(2)
if (run.status === 0) console.log(`${TOOL}: ${files.length} file(s), no errors`)
process.exit(run.status)
