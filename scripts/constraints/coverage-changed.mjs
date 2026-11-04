#!/usr/bin/env node
// coverage-changed: the tests related to the change, then the share of changed
// lines in the logic files that those tests run (CONSTRAINTS.md).
//
//   node scripts/constraints/coverage-changed.mjs [--base <ref>] [--lcov <file>]
//
//   default        run the vitest tests related to the changed files under src/,
//                  collecting coverage of the changed logic files only
//   --lcov <file>  read an lcov report a test run already wrote (CI) instead
//
// Logic files: src/lib, src/hooks, a feature's api/, hooks/ and lib/, and the
// Zustand stores. Components and pages are not measured: the screens are
// checked by hand (docs/WORKFLOW.md, A3), by behaviour tests where they earn
// their keep, and by the accessibility check.
//
// Only lines the coverage report calls executable count: a blank line, a type
// or an import is neither covered nor uncovered.
//
// Exit 0 passed, 1 a test failed or the share is under the bar, 2 the check could not run.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { bail, goToTop, option, readChange, resolveBase, touchedFiles } from './change.mjs'

const TOOL = 'coverage-changed'
const MIN_PERCENT = 80
const MEASURED = /^src\/(lib|hooks)\/.*\.tsx?$|^src\/features\/[^/]+\/(api|hooks|lib)\/.*\.tsx?$|\.store\.tsx?$/
const isTestOrType = (f) => /\.(test|spec)\.tsx?$|\.d\.ts$/.test(f) || f.includes('/__tests__/')

goToTop(TOOL)
const change = readChange(TOOL, { base: resolveBase(TOOL) })
const measured = touchedFiles(change).filter((f) => MEASURED.test(f) && !isTestOrType(f))

let lcovFile = option('--lcov')
if (!lcovFile) {
    const sources = touchedFiles(change).filter((f) => /^src\/.*\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
    if (!sources.length) {
        console.log(`${TOOL}: no changed files under src/`)
        process.exit(0)
    }
    lcovFile = 'coverage/changed/lcov.info'
    const coverageArgs = measured.length
        ? [
              '--coverage.enabled',
              ...measured.map((f) => `--coverage.include=${f}`),
              '--coverage.reporter=lcov',
              '--coverage.reporter=text-summary',
              '--coverage.reportsDirectory=coverage/changed'
          ]
        : []
    const run = spawnSync(
        process.execPath,
        [
            'node_modules/vitest/vitest.mjs',
            'related',
            ...sources,
            '--run',
            '--passWithNoTests',
            // Two jsdom workers instead of six keep this light on a laptop
            // that is also running Docker and an editor.
            '--maxWorkers=2',
            ...coverageArgs
        ],
        { stdio: 'inherit' }
    )
    if (run.status !== 0) {
        console.error(`${TOOL}: the related tests did not pass`)
        process.exit(run.status === null ? 2 : 1)
    }
    if (!measured.length) {
        console.log(`${TOOL}: tests passed; no changed logic files to measure`)
        process.exit(0)
    }
}

if (!existsSync(lcovFile)) bail(TOOL, `no coverage report at ${lcovFile}`)

// lcov: SF:<path> starts a file, DA:<line>,<hits> is one executable line.
const hits = new Map()
let current = null
for (const text of readFileSync(lcovFile, 'utf8').split(/\r?\n/)) {
    if (text.startsWith('SF:')) {
        current = new Map()
        hits.set(relative(process.cwd(), resolve(text.slice(3))).replaceAll('\\', '/'), current)
    } else if (text.startsWith('DA:') && current) {
        const [line, count] = text.slice(3).split(',').map(Number)
        current.set(line, count)
    }
}

let total = 0
let covered = 0
const missed = []
for (const file of measured) {
    const lines = hits.get(file)
    if (!lines) continue // nothing executable in it (types only)
    const uncovered = []
    for (const { line } of change.added.filter((a) => a.file === file)) {
        if (!lines.has(line)) continue
        total++
        if (lines.get(line) > 0) covered++
        else uncovered.push(line)
    }
    if (uncovered.length) missed.push(`  ${file}: line ${uncovered.join(', ')}`)
}

if (!total) {
    console.log(`${TOOL}: no executable changed lines in the logic files`)
    process.exit(0)
}
const percent = Math.round((covered / total) * 1000) / 10
const verdict = `${covered}/${total} changed lines in the logic files covered (${percent}%, bar ≥ ${MIN_PERCENT}%)`
if (percent >= MIN_PERCENT) {
    console.log(`${TOOL}: ${verdict}`)
    process.exit(0)
}
console.error(`${TOOL}: ${verdict}`)
console.error('Not run by any test:')
for (const m of missed) console.error(m)
process.exit(1)
