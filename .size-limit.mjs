// What the browser downloads before the first screen (CONSTRAINTS.md,
// performance): the entry script, the chunks index.html preloads, and the
// stylesheet. Read from the built index.html, so a library that slips into
// the entry or a new vendor chunk is counted without editing this file.
// Run after `pnpm build` (`pnpm size`).
//
// Limits: measured after M0's clean-up slice (05/11/2026: JS 245.83 kB,
// CSS 5.92 kB), plus the 0.5% tolerance CONSTRAINTS.md allows. Raise them
// only as CONSTRAINTS.md says: the owner decides, in a commit of its own.
import { existsSync, readFileSync } from 'node:fs'

if (!existsSync('dist/index.html')) throw new Error('size-limit: no dist/index.html, run pnpm build first')
const html = readFileSync('dist/index.html', 'utf8')
const tags = (name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1]
const local = (url) => `dist${url}`

const js = [
    ...tags('script')
        .filter((t) => attr(t, 'type') === 'module')
        .map((t) => attr(t, 'src')),
    ...tags('link')
        .filter((t) => attr(t, 'rel') === 'modulepreload')
        .map((t) => attr(t, 'href'))
]
    .filter(Boolean)
    .map(local)
const css = tags('link')
    .filter((t) => attr(t, 'rel') === 'stylesheet')
    .map((t) => attr(t, 'href'))
    .filter(Boolean)
    .map(local)

export default [
    { name: 'Initial JS (gzip)', path: js, gzip: true, limit: '247.06 kB' },
    { name: 'Initial CSS (gzip)', path: css, gzip: true, limit: '5.95 kB' }
]
