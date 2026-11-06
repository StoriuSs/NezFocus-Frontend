import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The type scale of DESIGN.md (tailwind.config.js `fontSize`). tailwind-merge
 * must know these are font sizes: unknown `text-*` classes count as colours,
 * so `text-body-sm text-text-secondary` would lose the size.
 */
const FONT_SIZES = [
    'hero',
    'display',
    'title-1',
    'title-2',
    'headline',
    'body',
    'body-sm',
    'label',
    'micro',
    'timer',
    'timer-long',
    'stat',
    'numeric-inline',
    'mono-code'
]

const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ text: FONT_SIZES }]
        }
    }
})

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
