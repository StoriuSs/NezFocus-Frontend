import { useEffect } from 'react'
import { siteConfig } from '@/config/site'

/**
 * The browser tab's title while this page is open (X-01): "Create account ·
 * NezFocus". Goes back to the product's name when the page closes.
 */
export function useDocumentTitle(title: string): void {
    useEffect(() => {
        document.title = `${title} · ${siteConfig.name}`
        return () => {
            document.title = siteConfig.name
        }
    }, [title])
}
