import { useEffect } from 'react'
import { siteConfig } from '@/config/site'

// One tab title for the whole app: the page's part, the session's clock and the unread number, set from different places.
let page: string | null = null
let clock: string | null = null
let count = 0

function show() {
    // The session one is in takes the page's place, on every page (07 S-ROOM-05, X-01).
    const part = clock ?? page
    const title = part === null ? siteConfig.name : `${part} · ${siteConfig.name}`
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${title}` : title
}

/**
 * The browser tab's title while this page is open (X-01): "Create account ·
 * NezFocus". Goes back to the product's name when the page closes. `null`
 * while the page has no title yet (the invite page, before the server's name
 * comes): the product's name alone.
 */
export function useDocumentTitle(title: string | null): void {
    useEffect(() => {
        page = title
        show()
        return () => {
            page = null
            show()
        }
    }, [title])
}

/**
 * The unread number the title starts with (REQ-MSG-09, X-01): "(3)
 * NezFocus", stopping at "(99+)" like a badge; nothing at 0. Set once, by
 * the signed-in shell, from the features that count (shared code knows none).
 */
export function useTitleCount(unread: number): void {
    useEffect(() => {
        count = unread
        show()
        return () => {
            count = 0
            show()
        }
    }, [unread])
}

/**
 * The study session one is in, in place of the page's part (REQ-STUDY-06,
 * 07 S-ROOM-05): "(2) 18:42 · Tập trung · NezFocus" on every page, the
 * unread number still first. `null` (no session, a voice room without
 * one): the page's own title again.
 */
export function useTitleClock(text: string | null): void {
    useEffect(() => {
        clock = text
        show()
    }, [text])
    useEffect(
        () => () => {
            clock = null
            show()
        },
        []
    )
}
