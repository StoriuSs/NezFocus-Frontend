import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import base from './tailwind.config.js'

// Tailwind's own word splitter: the same candidates it reads from the main files.
const { defaultExtractor } = createRequire(import.meta.url)('tailwindcss/lib/lib/defaultExtractor.js')
const extract = defaultExtractor({ tailwindConfig: { separator: ':', prefix: '' } })

const MESSAGING = join('src', 'features', 'messaging')

/** Every .ts / .tsx file under `dir`, the messaging feature's left out. */
function sourcesOutsideMessaging(dir) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (path === MESSAGING) return []
        if (statSync(path).isDirectory()) return sourcesOutsideMessaging(path)
        return /\.(js|ts|jsx|tsx)$/.test(name) ? [path] : []
    })
}

/**
 * Every class candidate of the rest of the app, read the way Tailwind reads
 * the main stylesheet's files: what that stylesheet already holds.
 */
function classesOfTheRest() {
    const words = new Set()
    for (const file of ['index.html', ...sourcesOutsideMessaging('src')]) {
        for (const word of extract(readFileSync(file, 'utf8'))) words.add(word)
    }
    return [...words]
}

/**
 * The chat's stylesheet (src/features/messaging/messaging.css): the same
 * tokens and theme as tailwind.config.js, only the classes of the messaging
 * feature that the rest of the app does not use. It loads with the chat's
 * chunk, after the main stylesheet, so the chat's classes stay out of the one
 * loaded before the first screen (CONSTRAINTS.md, performance; owner's call,
 * M2 L4a), and a class the main stylesheet has is never written again: a
 * repeat loaded later would beat the main file's own rules (a plain
 * `text-center` over DialogHeader's `sm:text-left`, everywhere in the app).
 * `.size-limit.mjs` checks that the two files share no class.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
    ...base,
    // Tests need no styles.
    content: ['./src/features/messaging/**/*.{js,ts,jsx,tsx}', '!./src/features/messaging/__tests__/**'],
    blocklist: classesOfTheRest()
}
