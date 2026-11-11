import { useEffect } from 'react'
import { siteConfig } from '@/config/site'

/**
 * The browser tab's title while this page is open (X-01): "Create account ·
 * NezFocus". Goes back to the product's name when the page closes. `null`
 * while the page has no title yet (the invite page, before the server's name
 * comes): the product's name alone.
 */
export function useDocumentTitle(title: string | null): void {
    useEffect(() => {
        document.title = title === null ? siteConfig.name : `${title} · ${siteConfig.name}`
        return () => {
            document.title = siteConfig.name
        }
    }, [title])
}
