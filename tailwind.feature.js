import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import base from './tailwind.config.js'

// Tailwind's own word splitter: the same candidates it reads from the main files.
const { defaultExtractor } = createRequire(import.meta.url)('tailwindcss/lib/lib/defaultExtractor.js')
const extract = defaultExtractor({ tailwindConfig: { separator: ':', prefix: '' } })

/**
 * The features whose classes are a stylesheet of their own, loaded with
 * their lazy chunk: the chat (M2 L4a), tasks (D-193), the inbox (M3 L6b) and
 * voice rooms (M4 L3a).
 * tailwind.config.js leaves the same folders out.
 */
export const SPLIT_FEATURES = ['messaging', 'tasks', 'notifications', 'voice']
const SPLIT = SPLIT_FEATURES.map((feature) => join('src', 'features', feature))

/** Every .ts / .tsx file under `dir`, the split features left out: the main stylesheet's files. */
function mainSources(dir) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (SPLIT.includes(path)) return []
        if (statSync(path).isDirectory()) return mainSources(path)
        return /\.(js|ts|jsx|tsx)$/.test(name) ? [path] : []
    })
}

/**
 * Every class candidate of the main stylesheet's files, read the way
 * Tailwind reads them: what that stylesheet already holds.
 */
function classesOfTheMain() {
    const words = new Set()
    for (const file of ['index.html', ...mainSources('src')]) {
        for (const word of extract(readFileSync(file, 'utf8'))) words.add(word)
    }
    return [...words]
}

/**
 * A split feature's stylesheet (src/features/<feature>/<feature>.css): the
 * same tokens and theme as tailwind.config.js, only the classes of that
 * feature the main stylesheet does not have. It loads with the feature's
 * chunk, after the main stylesheet, so those classes stay out of the one
 * loaded before the first screen (CONSTRAINTS.md, performance), and a class
 * the main stylesheet has is never written again: a repeat loaded later
 * would beat the main file's own rules (a plain `text-center` over
 * DialogHeader's `sm:text-left`, everywhere in the app). `.size-limit.mjs`
 * checks that no split stylesheet shares a class with the main one.
 *
 * @returns {import('tailwindcss').Config}
 */
export function featureConfig(feature) {
    return {
        ...base,
        // Tests need no styles.
        content: [`./src/features/${feature}/**/*.{js,ts,jsx,tsx}`, `!./src/features/${feature}/__tests__/**`],
        blocklist: classesOfTheMain(),
        // No open / close plugin: its keyframes come with every stylesheet it is in, and the
        // classes that use them are the main stylesheet's (src/components/ui).
        plugins: []
    }
}
