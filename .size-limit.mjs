// What the browser downloads before the first screen (CONSTRAINTS.md,
// performance): the entry script, the chunks index.html preloads, and the
// stylesheet. Read from the built index.html, so a library that slips into
// the entry or a new vendor chunk is counted without editing this file.
// Run after `pnpm build` (`pnpm size`).
//
// No `limit` yet: the budget is measured after M0's clean-up slice and
// written here then. Until that, size-limit reports and never fails.
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
    { name: 'Initial JS (gzip)', path: js, gzip: true },
    { name: 'Initial CSS (gzip)', path: css, gzip: true }
]
