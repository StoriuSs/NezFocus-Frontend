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
// From M2 L4a (13/11/2026) the chat's classes are a stylesheet of their own,
// loaded with its chunk (tailwind.messaging.config.js): "Chat CSS" below,
// 321 B when it began (only the chat's own classes, none the main file has),
// limit with the same 0.5% tolerance.
// Raise them
// only as CONSTRAINTS.md says: the owner decides, in a commit of its own.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

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

// The chat's stylesheet: Vite names it after the lazy chunk (ChannelChat-<hash>.css).
const chatCss = readdirSync('dist/assets')
    .filter((file) => file.startsWith('ChannelChat-') && file.endsWith('.css'))
    .map((file) => `dist/assets/${file}`)
if (chatCss.length !== 1) throw new Error(`size-limit: expected one ChannelChat-*.css, found ${chatCss.length}`)

// The chat's stylesheet loads after the main one: a class written in both
// would let the chat's copy beat the main file's own rules everywhere in the
// app (tailwind.messaging.config.js, blocklist). None may be shared.
// The class a rule is written for: the last one of each selector
// (`.group:hover .group-hover\:flex` is for `group-hover:flex`, not `group`).
// Class names keep backslash escapes (`.h-\[600px\]`, `.sm\:flex`).
const CLASS = /\.((?:\\.|[\w-])+)/g
const classesIn = (paths) =>
    new Set(
        paths.flatMap((path) =>
            [...readFileSync(path, 'utf8').matchAll(/([^{}@;]+)\{/g)].flatMap(([, prelude]) =>
                prelude.split(',').flatMap((selector) => {
                    const last = [...selector.replace(/\([^)]*\)/g, '').matchAll(CLASS)].at(-1)
                    return last ? [last[1]] : []
                })
            )
        )
    )
const mainClasses = classesIn(css)
const shared = [...classesIn(chatCss)].filter((name) => mainClasses.has(name))
if (shared.length)
    throw new Error(
        `size-limit: the chat's stylesheet repeats ${shared.length} class(es) of the main one: ${shared.slice(0, 10).join(' ')}`
    )

export default [
    { name: 'Initial JS (gzip)', path: js, gzip: true, limit: '246.75 kB' },
    { name: 'Initial CSS (gzip)', path: css, gzip: true, limit: '8.80 kB' },
    { name: 'Chat CSS (gzip)', path: chatCss, gzip: true, limit: '323 B' }
]
