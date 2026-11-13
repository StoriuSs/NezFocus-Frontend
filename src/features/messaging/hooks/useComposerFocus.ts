import { useEffect, type RefObject } from 'react'

/** How the person last moved around the page: a channel opened from the keyboard keeps its focus there. */
let lastInput: 'pointer' | 'keyboard' = 'pointer'
let tracking = false

function trackInput() {
    if (tracking) return
    tracking = true
    document.addEventListener('pointerdown', () => (lastInput = 'pointer'), true)
    document.addEventListener('keydown', () => (lastInput = 'keyboard'), true)
}

/** Places where a key press already means something: typing, or picking in a menu or list by letter. */
const KEEPS_ITS_KEYS =
    'input, textarea, select, [contenteditable="true"], [role="menu"], [role="menubar"], [role="listbox"], [role="tree"], [role="dialog"]'

/**
 * Where the cursor goes around the composer (C-12 › Focus):
 * - opening a channel with the mouse puts it in the composer; from the
 *   keyboard (the channel list) it stays where it was;
 * - a letter typed while focus is in no field goes into the composer.
 *   Space and Enter stay with the button or link they press, a key a
 *   handler already took is left alone, and so is typing in a menu, a list
 *   or a dialog.
 */
export function useComposerFocus(box: RefObject<HTMLTextAreaElement | null>, channelId: string): void {
    useEffect(() => {
        trackInput()
        if (lastInput === 'pointer') box.current?.focus()
    }, [box, channelId])

    useEffect(() => {
        const toComposer = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.key.length !== 1 || event.key === ' ') return
            if (event.ctrlKey || event.metaKey || event.altKey) return
            const target = event.target instanceof Element ? event.target : null
            if (target?.closest(KEEPS_ITS_KEYS) || (target as HTMLElement | null)?.isContentEditable) return
            // A dialog open over the page keeps the keyboard, wherever its focus is.
            if (document.querySelector('[role="dialog"]')) return
            box.current?.focus()
        }
        document.addEventListener('keydown', toComposer)
        return () => document.removeEventListener('keydown', toComposer)
    }, [box])
}
