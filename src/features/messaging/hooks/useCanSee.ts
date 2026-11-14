import { useSyncExternalStore } from 'react'

/** Whether the reader can see the page now (D-46): the tab is shown and its window has focus. */
export const canSeePage = () => document.visibilityState === 'visible' && document.hasFocus()

// Coming back (the tab shown again, the window focused) draws again at once. Leaving needs no
// event: it is read afresh at every drawing, and before every measure of what is in view.
function subscribe(onChange: () => void) {
    document.addEventListener('visibilitychange', onChange)
    window.addEventListener('focus', onChange)
    return () => {
        document.removeEventListener('visibilitychange', onChange)
        window.removeEventListener('focus', onChange)
    }
}

/**
 * Whether the reader can see the page (D-46). Messages are read only then; a
 * tab left in the background keeps its new messages unread, and its title
 * counts them.
 */
export function useCanSee(): boolean {
    return useSyncExternalStore(subscribe, canSeePage)
}
