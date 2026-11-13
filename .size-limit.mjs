// What the browser downloads before the first screen (CONSTRAINTS.md,
// performance): the entry script, the chunks index.html preloads, and the
// stylesheet. Read from the built index.html, so a library that slips into
// the entry or a new vendor chunk is counted without editing this file.
// Run after `pnpm build` (`pnpm size`).
//
// Limits: measured after M0's slice L4 (06/11/2026: JS 242.78 kB, CSS
// 7.28 kB), plus the 0.5% tolerance CONSTRAINTS.md allows. L4 added the
// design tokens and self-hosted fonts (CSS up) and dropped the `ui` vendor
// chunk (JS down). JS raised to 246.75 kB after L12 (07/11/2026, 246.41 kB:
// the profile page's words in both languages). CSS raised to 8.72 kB after
// M1 L5 (09/11/2026, 8.67 kB: the classes of the rail, channel list, drag
// and drop, channel dialogs, Select and server settings; Tailwind puts every
// page's classes in the one stylesheet loaded first). CSS raised to 8.77 kB
// after M1 L9b (11/11/2026, 8.75 kB: the 160 cap of the role column in the
// handover picker, S-SET-07, once the slice's other new classes were swapped
// for ones already there). CSS raised to 8.80 kB after M2 L3 (13/11/2026,
// 8.79 kB: the chat's text that keeps its line breaks and the composer's
// counter, once 15 other new classes were swapped for ones already there).
// Raise them
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
    { name: 'Initial JS (gzip)', path: js, gzip: true, limit: '246.75 kB' },
    { name: 'Initial CSS (gzip)', path: css, gzip: true, limit: '8.80 kB' }
]
