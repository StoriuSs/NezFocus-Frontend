import { useEffect } from 'react'
import { siteConfig } from '@/config/site'

// One tab title for the whole app: the page's part and the unread number, set from different places.
let page: string | null = null
let count = 0

function show() {
    const title = page === null ? siteConfig.name : `${page} · ${siteConfig.name}`
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
