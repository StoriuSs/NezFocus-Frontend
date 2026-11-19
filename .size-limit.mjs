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
// limit with the same 0.5% tolerance. Raised to 511 B after M2 L4b
// (13/11/2026, 508 B: message formatting, message link chips and the
// `highlight` keyframes). Raised to 614 B after M2 L5 (14/11/2026, 611 B:
// the pinned cards' 3 lines, the emoji picker's 8 columns and the reaction
// chip's padding, once the slice's other new classes were swapped for ones
// the main stylesheet has). Raised to 627 B after M2 L6a (14/11/2026, 624 B:
// a message about the reader one step up on keyboard focus, as on hover,
// once the slice's other new classes were swapped for ones the main
// stylesheet has or set inline). Raised to 647 B after M2 L7 (14/11/2026,
// 644 B: the presence dot's cutout in the colour of the suggestion row
// chosen, `surface-2`, as C-03 asks, rather than the popover's).
// From M3 L3 (17/11/2026, D-193) the tasks' classes are a stylesheet of their
// own too, loaded with the Task Board's chunk (tailwind.feature.js): "Tasks
// CSS" below, 622 B when it began (the board, its row, its form, the date
// and people pickers), limit with the same 0.5% tolerance.
// From M3 L6b (17/11/2026) the inbox's classes are one more (D-193), loaded
// with its Popover's chunk: "Notifications CSS" below, 483 B when it began
// (the panel's size, a row's layers and its ✓ on hover or focus, the "N new"
// button, the loading rows), limit with the same 0.5% tolerance; 493 B from
// M3 L7b (18/11/2026, the type's square of a reminder or a task no one is
// on, a shade darker under the hovered row), limit 496 B; 505 B from M3 L8b
// (18/11/2026, a kick or a ban row is its own keyboard stop: its ✓ and dot
// follow the row's own focus), limit 508 B.
// From M4 L3a (18/11/2026) voice rooms are a stylesheet of their own too
// (tailwind.voice.config.js), loaded with a room's page or the dock: "Voice
// CSS" below, 284 B when it began; and their scripts, never in the first
// download (CONSTRAINTS.md): the room's page, the dock and LiveKit's client,
// "Voice JS" below (the chunks a room's page and the dock bring, found by their
// imports, and LiveKit's client), 187.35 kB when it began; both limits with the same 0.5%
// tolerance. Voice JS raised to 190.61 kB after M4 L3b (18/11/2026, 189.66 kB: the
// camera on the preview page and in the room, its blocked Banner and help, zooming a
// tile, the keyboard between tiles; pictures attached to a <video> by hand rather
// than with VideoTrack and useTracks, which cost 3 kB more). Raised to 203.82 kB after
// M4 L4b (19/11/2026, 202.81 kB): a moderator's menu on the tiles brings Radix's
// dropdown chunk (10.77 kB, the one the channel list already loads for the server's
// menu), and about 2.4 kB of the slice's own code (the menu, muted by a moderator).
// Initial CSS raised to 9.64 kB after M4 L4b (9586 B): the ⋯ of a person's row in
// the channel list shows on that row's hover or focus (a named group, as the room's
// row is a group itself).
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

// A split feature's stylesheet: Vite names it after the lazy chunk (ChannelChat-<hash>.css);
// the tasks' has a chunk of its own name, shared by the board and the detail (vite.config.ts).
const chunkCss = (chunk) => {
    const found = readdirSync('dist/assets')
        .filter((file) => file.startsWith(`${chunk}-`) && file.endsWith('.css'))
        .map((file) => `dist/assets/${file}`)
    if (found.length !== 1) throw new Error(`size-limit: expected one ${chunk}-*.css, found ${found.length}`)
    return found
}
const chatCss = chunkCss('ChannelChat')
const tasksCss = chunkCss('TaskStyles')
const notificationsCss = chunkCss('NotificationStyles')
const voiceCss = chunkCss('VoiceStyles')

// A lazy chunk's script, by the name Vite gives it (VoiceRoomView-<hash>.js).
const chunkJs = (chunk) => {
    const found = readdirSync('dist/assets')
        .filter((file) => file.startsWith(`${chunk}-`) && file.endsWith('.js'))
        .map((file) => `dist/assets/${file}`)
    if (found.length !== 1) throw new Error(`size-limit: expected one ${chunk}-*.js, found ${found.length}`)
    return found
}
// The scripts a lazy chunk brings with it: the chunk and every chunk it
// imports, and those in turn (`from"./x.js"` in the built code), less the
// first download's. A room's page and the dock share chunks Rollup names after
// whatever module comes first in them, so they are found, not named.
const lazyWithImports = (starts) => {
    const first = new Set(js)
    const seen = new Set()
    const queue = [...starts]
    while (queue.length) {
        const path = queue.pop()
        if (seen.has(path) || first.has(path)) continue
        seen.add(path)
        const code = readFileSync(path, 'utf8')
        for (const [, file] of code.matchAll(/from\s*"\.\/([\w.-]+\.js)"/g)) queue.push(`dist/assets/${file}`)
    }
    return [...seen]
}
// LiveKit's client is read with import() when a room is joined, from the shell's chunk.
const voiceJs = lazyWithImports(['VoiceRoomView', 'InRoomDock', 'livekit-client.esm'].flatMap(chunkJs))

// A split stylesheet loads after the main one: a class written in both would
// let the later copy beat the main file's own rules everywhere in the app
// (tailwind.feature.js, blocklist). None may be shared.
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
for (const [name, paths] of [
    ['chat', chatCss],
    ['tasks', tasksCss],
    ['notifications', notificationsCss],
    ['voice', voiceCss]
]) {
    const shared = [...classesIn(paths)].filter((one) => mainClasses.has(one))
    if (shared.length)
        throw new Error(
            `size-limit: the ${name} stylesheet repeats ${shared.length} class(es) of the main one: ${shared.slice(0, 10).join(' ')}`
        )
}

export default [
    { name: 'Initial JS (gzip)', path: js, gzip: true, limit: '246.75 kB' },
    { name: 'Initial CSS (gzip)', path: css, gzip: true, limit: '9.64 kB' },
    { name: 'Chat CSS (gzip)', path: chatCss, gzip: true, limit: '647 B' },
    { name: 'Tasks CSS (gzip)', path: tasksCss, gzip: true, limit: '880 B' },
    { name: 'Notifications CSS (gzip)', path: notificationsCss, gzip: true, limit: '508 B' },
    { name: 'Voice CSS (gzip)', path: voiceCss, gzip: true, limit: '286 B' },
    { name: 'Voice JS (gzip)', path: voiceJs, gzip: true, limit: '203.82 kB' }
]
