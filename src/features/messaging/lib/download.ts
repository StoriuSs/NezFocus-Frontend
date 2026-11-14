/**
 * Saves a file from its link (one answering `attachment`) through a link
 * opened in a new tab: the browser downloads it and closes that tab, and this
 * page never navigates (no leave-page prompt, nothing of the app lost).
 */
export function startDownload(url: string): void {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
}
